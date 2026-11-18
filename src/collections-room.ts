/**
 * One shared room for every synced entity collection.
 *
 * Gutenberg syncs some collections (`root/comment`, and post types fetched with
 * `per_page: -1`) through a Yjs document per collection. Those documents carry
 * no content: the only thing peers use from them is the `state.savedAt`
 * timestamp, a signal that someone saved a record and others should refetch
 * the collection from the REST API.
 *
 * Giving each collection its own room meant every open editor joined several
 * site-wide rooms. Each of those rooms also carried y-websocket's default
 * awareness, which renews an empty `{}` state every 15 seconds and which the
 * server rebroadcasts to every member, so the server sent N² / 15 frames per
 * second per collection room.
 *
 * Instead, every collection on the page is bridged into one shared document in
 * one room (`site-{blogId}/vip-rtc/collections-collection`):
 *
 * - Each collection's signal lives in a top-level map named after its object
 *   type. Top-level types never conflict when two peers create them at once,
 *   unlike nested maps under a shared parent.
 * - The room has no awareness (local state `null`), so nothing is broadcast
 *   between saves. To satisfy y-websocket's 30-second "no message received"
 *   liveness check, the provider re-requests sync every 15 seconds; the
 *   server answers only the requesting client, so idle cost is O(N), not O(N²).
 */

import { Awareness } from 'y-protocols/awareness';

import { SyncConnectionStatusEmitter } from '@/utilities/sync-event-emitter';
import { Doc, transact } from '@/yjs-shim';

import type { ConnectionStatus, ProviderCreatorResult, ProviderEventMap } from '@/types/sync';
import type * as Yjs from 'yjs';

/** Sync object type of the shared room. Its token is requested like any collection's. */
export const COLLECTIONS_ROOM_OBJECT_TYPE = 'vip-rtc/collections';

/**
 * How often the shared room's provider re-requests sync. Must stay below
 * y-websocket's 30-second `messageReconnectTimeout` to keep the socket alive.
 */
export const COLLECTIONS_ROOM_RESYNC_INTERVAL_MS = 15_000;

// Gutenberg's collection document keys (`@wordpress/sync` config.ts).
const STATE_MAP_KEY = 'state';
const SAVED_AT_KEY = 'savedAt';
const SAVED_BY_KEY = 'savedBy';
const SIGNAL_KEYS = [ SAVED_AT_KEY, SAVED_BY_KEY ] as const;

const BRIDGE_ORIGIN = Symbol( 'vip-rtc-collections-room' );

/** Creates the provider for the shared document. Must not reject. */
export type CollectionsRoomProviderFactory = (
	ydoc: Yjs.Doc,
	awareness: Awareness
) => Promise< ProviderCreatorResult >;

interface SharedRoom {
	ydoc: Yjs.Doc;
	awareness: Awareness;
	provider: Promise< ProviderCreatorResult >;
	status: SyncConnectionStatusEmitter;
	lastStatus: ConnectionStatus | undefined;
	references: number;
}

function copySignal( from: Yjs.Map< unknown >, to: Yjs.Map< unknown > ): void {
	for ( const key of SIGNAL_KEYS ) {
		if ( from.has( key ) ) {
			to.set( key, from.get( key ) );
		}
	}
}

/**
 * Create the per-page manager of the shared collections room. The room opens
 * when the first collection attaches and closes when the last one detaches.
 */
export function createCollectionsRoom( createProvider: CollectionsRoomProviderFactory ): {
	attach: ( objectType: string, ydoc: Yjs.Doc ) => Promise< ProviderCreatorResult >;
} {
	let current: SharedRoom | null = null;

	function acquire(): SharedRoom {
		if ( ! current ) {
			const ydoc = new Doc();
			const awareness = new Awareness( ydoc );
			awareness.setLocalState( null );
			const room: SharedRoom = {
				ydoc,
				awareness,
				status: new SyncConnectionStatusEmitter(),
				lastStatus: undefined,
				references: 0,
				provider: Promise.resolve( { destroy: () => {}, on: () => {} } ),
			};
			room.provider = createProvider( ydoc, awareness ).then( result => {
				result.on( 'status', status => {
					room.lastStatus = status;
					room.status.emit( status );
				} );
				return result;
			} );
			current = room;
		}
		current.references += 1;
		return current;
	}

	function release( room: SharedRoom ): void {
		room.references -= 1;
		if ( room.references > 0 ) {
			return;
		}
		if ( current === room ) {
			current = null;
		}
		room.status.destroy();
		void room.provider.then( result => {
			result.destroy();
			room.awareness.destroy();
			room.ydoc.destroy();
		} );
	}

	async function attach( objectType: string, ydoc: Yjs.Doc ): Promise< ProviderCreatorResult > {
		const room = acquire();
		const sharedSignal = room.ydoc.getMap< unknown >( objectType );
		const localState = ydoc.getMap< unknown >( STATE_MAP_KEY );

		// A save in this editor: publish it to the shared room.
		const publishLocalSave = (
			event: Yjs.YMapEvent< unknown >,
			transaction: Yjs.Transaction
		): void => {
			if ( transaction.local && event.keysChanged.has( SAVED_AT_KEY ) ) {
				room.ydoc.transact( () => copySignal( localState, sharedSignal ), BRIDGE_ORIGIN );
			}
		};

		// A save by a peer: hand it to Gutenberg as a remote (non-local)
		// transaction, which is what its collection observer reacts to.
		const deliverRemoteSave = (
			event: Yjs.YMapEvent< unknown >,
			transaction: Yjs.Transaction
		): void => {
			if ( ! transaction.local && event.keysChanged.has( SAVED_AT_KEY ) ) {
				transact( ydoc, () => copySignal( sharedSignal, localState ), BRIDGE_ORIGIN, false );
			}
		};

		localState.observe( publishLocalSave );
		sharedSignal.observe( deliverRemoteSave );
		await room.provider;

		const listeners = new Set< ( status: ConnectionStatus ) => void >();
		let destroyed = false;

		return {
			destroy: () => {
				if ( destroyed ) {
					return;
				}
				destroyed = true;
				localState.unobserve( publishLocalSave );
				sharedSignal.unobserve( deliverRemoteSave );
				listeners.forEach( listener => room.status.off( listener ) );
				listeners.clear();
				release( room );
			},
			on: < K extends keyof ProviderEventMap >(
				event: K,
				callback: ( data: ProviderEventMap[ K ] ) => void
			) => {
				if ( 'status' !== event || destroyed ) {
					return;
				}
				const listener = callback;
				listeners.add( listener );
				room.status.on( listener );
				// The room may have connected before this collection attached.
				if ( room.lastStatus ) {
					listener( room.lastStatus );
				}
			},
		};
	}

	return { attach };
}
