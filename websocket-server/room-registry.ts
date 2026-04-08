/**
 * Room Registry
 *
 * Manages multiplexed subscribers for Y.js rooms. Uses the same Y.Doc
 * instances as the legacy per-room WebSocket endpoint (via getYDoc from
 * @y/websocket-server) so both transports share state during the
 * transition period.
 *
 * The room-registry does NOT own the Y.Doc lifecycle — the
 * @y/websocket-server handles creation (via getYDoc) and cleanup
 * (when all conns are removed). This registry only tracks mux-specific
 * subscriber sets for broadcast routing.
 *
 * To prevent the legacy code from destroying a doc while mux clients
 * are still connected, each mux subscriber registers a sentinel object
 * in WSSharedDoc.conns. This keeps the doc alive until the last
 * subscriber (legacy or mux) disconnects.
 */
import { getYDoc } from '@y/websocket-server/utils';

import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

export interface RoomSubscriber {
	/** Send a binary y-protocols message to this subscriber. */
	send( data: Uint8Array ): void;
	/** The Y.Doc clientID for this subscriber. */
	clientId: number;
}

interface MuxRoomState {
	subscribers: Set< RoomSubscriber >;
	/** Sentinel objects registered in WSSharedDoc.conns to prevent premature cleanup. */
	sentinels: Map< RoomSubscriber, object >;
}

const muxRooms = new Map< string, MuxRoomState >();

// WebSocket readyState constants (from the ws spec).
const WS_READY_STATE_OPEN = 1;

/**
 * Create a sentinel object that looks like an open WebSocket to
 * @y/websocket-server's send() function. It silently drops all
 * messages since the mux handler manages its own broadcasting.
 */
function createSentinel(): object {
	return {
		readyState: WS_READY_STATE_OPEN,
		send( _data: Uint8Array, _opts: object, _cb: ( err?: Error ) => void ): void {
			// No-op: mux handler does its own message routing.
		},
		close(): void {
			// No-op: lifecycle managed by room-registry.
		},
	};
}

/**
 * Subscribe to a room. Returns the shared Y.Doc and Awareness.
 *
 * Uses getYDoc from @y/websocket-server so the returned doc is the
 * same instance that legacy WebSocket connections operate on.
 */
export function subscribe(
	roomName: string,
	subscriber: RoomSubscriber
): { doc: Y.Doc; awareness: Awareness } {
	// getYDoc returns the shared WSSharedDoc (creates if needed).
	const doc = getYDoc( roomName, true );
	const awareness: Awareness = doc.awareness;

	let muxRoom = muxRooms.get( roomName );
	if ( ! muxRoom ) {
		muxRoom = { subscribers: new Set(), sentinels: new Map() };
		muxRooms.set( roomName, muxRoom );
	}

	muxRoom.subscribers.add( subscriber );

	// Register a sentinel in the WSSharedDoc.conns map so the legacy
	// cleanup logic doesn't destroy the doc while mux clients exist.
	// The sentinel looks like an open WebSocket so the legacy send()
	// function won't try to close it.
	const sentinel = createSentinel();
	muxRoom.sentinels.set( subscriber, sentinel );
	doc.conns.set( sentinel, new Set() );

	// eslint-disable-next-line no-console
	console.log(
		`[room-registry] Subscribed to ${ roomName } (mux subscribers: ${ muxRoom.subscribers.size })`
	);

	return { doc, awareness };
}

/**
 * Unsubscribe from a room. Removes the mux subscriber and its sentinel.
 * The Y.Doc lifecycle is managed by @y/websocket-server — it will be
 * destroyed when all conns (legacy + mux sentinels) are removed.
 */
export function unsubscribe( roomName: string, subscriber: RoomSubscriber ): void {
	const muxRoom = muxRooms.get( roomName );
	if ( ! muxRoom ) {
		return;
	}

	muxRoom.subscribers.delete( subscriber );

	// Remove the sentinel from WSSharedDoc.conns.
	const sentinel = muxRoom.sentinels.get( subscriber );
	if ( sentinel ) {
		muxRoom.sentinels.delete( subscriber );
		const doc = getYDoc( roomName, true );
		doc.conns.delete( sentinel );
	}

	// eslint-disable-next-line no-console
	console.log(
		`[room-registry] Unsubscribed from ${ roomName } (mux subscribers: ${ muxRoom.subscribers.size })`
	);

	if ( muxRoom.subscribers.size === 0 ) {
		muxRooms.delete( roomName );

		// eslint-disable-next-line no-console
		console.log( `[room-registry] All mux subscribers left room: ${ roomName }` );
	}
}

/**
 * Broadcast a binary message to all mux subscribers of a room except the sender.
 */
export function broadcast( roomName: string, sender: RoomSubscriber, data: Uint8Array ): void {
	const muxRoom = muxRooms.get( roomName );
	if ( ! muxRoom ) {
		return;
	}

	muxRoom.subscribers.forEach( subscriber => {
		if ( subscriber !== sender ) {
			subscriber.send( data );
		}
	} );
}

/**
 * Get the number of active mux rooms (for monitoring).
 */
export function getActiveRoomCount(): number {
	return muxRooms.size;
}
