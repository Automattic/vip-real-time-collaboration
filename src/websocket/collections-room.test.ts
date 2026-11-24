import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as Yjs from 'yjs';

import { decodeMessage } from '../../websocket-server/protocol';
import { createCollectionsRoom } from '../collections-room';
import { createWebSocketConnection } from '../websocket-client';
import { setYjsModule } from '../yjs-shim';
import { acknowledgeRoom, FakePhysicalWebSocket } from './fake-physical-websocket.test-helper';

import type { ConnectionStatus, ProviderCreatorResult } from '@/types/sync';
import type { Awareness } from 'y-protocols/awareness';

setYjsModule( Yjs );

const attached: ProviderCreatorResult[] = [];

afterEach( async () => {
	attached.splice( 0 ).forEach( result => result.destroy() );
	await Promise.resolve();
} );

function track( result: ProviderCreatorResult ): ProviderCreatorResult {
	attached.push( result );
	return result;
}

interface FakeRoomProvider {
	ydoc: Yjs.Doc;
	awareness: Awareness;
	destroyed: boolean;
	emitStatus: ( status: ConnectionStatus ) => void;
}

/** One editor page: its shared-room manager plus the providers it created. */
function createPage(): {
	room: { attach: ( objectType: string, ydoc: Yjs.Doc ) => Promise< ProviderCreatorResult > };
	providers: FakeRoomProvider[];
} {
	const providers: FakeRoomProvider[] = [];
	const room = createCollectionsRoom( ( ydoc, awareness ) => {
		const listeners: Array< ( status: ConnectionStatus ) => void > = [];
		const provider: FakeRoomProvider = {
			ydoc,
			awareness,
			destroyed: false,
			emitStatus: status => listeners.forEach( listener => listener( status ) ),
		};
		providers.push( provider );
		const result: ProviderCreatorResult = {
			destroy: () => {
				provider.destroyed = true;
			},
			on: ( _event, callback ) => {
				listeners.push( callback );
			},
		};
		return Promise.resolve( result );
	} );
	return {
		room: {
			attach: async ( objectType: string, ydoc: Yjs.Doc ) =>
				track( await room.attach( objectType, ydoc ) ),
		},
		providers,
	};
}

/** Relay updates between two shared documents, as the server would. */
function linkSharedDocs( first: Yjs.Doc, second: Yjs.Doc ): void {
	first.on( 'update', ( update: Uint8Array, origin: unknown ) => {
		if ( origin !== 'relay' ) {
			Yjs.applyUpdate( second, update, 'relay' );
		}
	} );
	second.on( 'update', ( update: Uint8Array, origin: unknown ) => {
		if ( origin !== 'relay' ) {
			Yjs.applyUpdate( first, update, 'relay' );
		}
	} );
}

/** Record what Gutenberg's collection observer would see. */
function observeRemoteSaves( ydoc: Yjs.Doc ): unknown[] {
	const saves: unknown[] = [];
	const state = ydoc.getMap( 'state' );
	state.observe( ( event, transaction ) => {
		if ( ! transaction.local && event.keysChanged.has( 'savedAt' ) ) {
			saves.push( state.get( 'savedAt' ) );
		}
	} );
	return saves;
}

/** What Gutenberg's markEntityAsSaved does on a user-facing save. */
function markSaved( ydoc: Yjs.Doc, savedAt: number ): void {
	ydoc.transact( () => {
		const state = ydoc.getMap( 'state' );
		state.set( 'savedAt', savedAt );
		state.set( 'savedBy', ydoc.clientID );
	}, 'gutenberg' );
}

describe( 'createCollectionsRoom', () => {
	it( 'opens one provider without awareness state for all collections', async () => {
		const { room, providers } = createPage();

		const comments = await room.attach( 'root/comment', new Yjs.Doc() );
		const templates = await room.attach( 'postType/wp_template', new Yjs.Doc() );

		assert.strictEqual( providers.length, 1 );
		assert.strictEqual( providers[ 0 ]?.awareness.getLocalState(), null );

		comments.destroy();
		assert.strictEqual( providers[ 0 ]?.destroyed, false );
		templates.destroy();
		await Promise.resolve();
		assert.strictEqual( providers[ 0 ]?.destroyed, true );
	} );

	it( 'opens a new provider when a collection attaches after the room closed', async () => {
		const { room, providers } = createPage();

		( await room.attach( 'root/comment', new Yjs.Doc() ) ).destroy();
		await room.attach( 'root/comment', new Yjs.Doc() );

		assert.strictEqual( providers.length, 2 );
	} );

	it( 'delivers a save to peers of the same collection as a remote change', async () => {
		const first = createPage();
		const second = createPage();
		const savingComments = new Yjs.Doc();
		const peerComments = new Yjs.Doc();
		const peerTemplates = new Yjs.Doc();
		await first.room.attach( 'root/comment', savingComments );
		await second.room.attach( 'root/comment', peerComments );
		await second.room.attach( 'postType/wp_template', peerTemplates );
		const firstShared = first.providers[ 0 ]?.ydoc;
		const secondShared = second.providers[ 0 ]?.ydoc;
		assert.ok( firstShared && secondShared );
		linkSharedDocs( firstShared, secondShared );
		const commentSaves = observeRemoteSaves( peerComments );
		const templateSaves = observeRemoteSaves( peerTemplates );
		const ownSaves = observeRemoteSaves( savingComments );

		markSaved( savingComments, 1234 );

		assert.deepStrictEqual( commentSaves, [ 1234 ] );
		assert.strictEqual( peerComments.getMap( 'state' ).get( 'savedBy' ), savingComments.clientID );
		assert.deepStrictEqual( templateSaves, [] );
		assert.deepStrictEqual( ownSaves, [] );
	} );

	it( 'stops bridging a collection once it is destroyed', async () => {
		const first = createPage();
		const second = createPage();
		const savingComments = new Yjs.Doc();
		const peerComments = new Yjs.Doc();
		await first.room.attach( 'root/comment', savingComments );
		await second.room.attach( 'root/comment', new Yjs.Doc() );
		const peer = await second.room.attach( 'root/comment', peerComments );
		const firstShared = first.providers[ 0 ]?.ydoc;
		const secondShared = second.providers[ 0 ]?.ydoc;
		assert.ok( firstShared && secondShared );
		linkSharedDocs( firstShared, secondShared );
		const saves = observeRemoteSaves( peerComments );

		peer.destroy();
		markSaved( savingComments, 1234 );

		assert.deepStrictEqual( saves, [] );
	} );

	it( 'shares room status with every collection, including late ones', async () => {
		const { room, providers } = createPage();
		const early = await room.attach( 'root/comment', new Yjs.Doc() );
		const earlyStatuses: ConnectionStatus[] = [];
		early.on( 'status', status => earlyStatuses.push( status ) );

		providers[ 0 ]?.emitStatus( { status: 'connected' } );
		const late = await room.attach( 'postType/wp_block', new Yjs.Doc() );
		const lateStatuses: ConnectionStatus[] = [];
		late.on( 'status', status => lateStatuses.push( status ) );
		early.destroy();
		providers[ 0 ]?.emitStatus( { status: 'connecting' } );

		assert.deepStrictEqual( earlyStatuses, [ { status: 'connected' } ] );
		assert.deepStrictEqual( lateStatuses, [ { status: 'connected' }, { status: 'connecting' } ] );
	} );
} );

describe( 'createWebSocketConnection collections', () => {
	beforeEach( () => {
		FakePhysicalWebSocket.instances = [];
	} );

	it( 'subscribes every collection through one shared room with one token', async () => {
		const tokenRequests: string[] = [];
		const providerCreator = createWebSocketConnection( 'wss://example.test/_ws/', {
			multiplexingEnabled: true,
			PhysicalWebSocket: FakePhysicalWebSocket as unknown as typeof WebSocket,
			fetchToken: ( syncObjectType, syncObjectId ) => {
				tokenRequests.push( `${ syncObjectType }:${ syncObjectId }` );
				return Promise.resolve( `grant-${ tokenRequests.length }` );
			},
			waitBeforeRetry: async () => {},
		} );

		const results = await Promise.all(
			[ 'root/comment', 'postType/wp_template' ].map( objectType =>
				providerCreator( { objectType, objectId: null, ydoc: new Yjs.Doc(), Y: Yjs } )
			)
		);
		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();

		assert.deepStrictEqual( tokenRequests, [ 'vip-rtc/collections:collection' ] );
		assert.strictEqual( FakePhysicalWebSocket.instances.length, 1 );
		assert.deepStrictEqual(
			physical.sent.map( bytes => decodeRoom( bytes ) ),
			[ 'site-1/vip-rtc/collections-collection' ]
		);
		results.forEach( track );
	} );
} );

describe( 'collections room liveness', () => {
	it( 're-requests sync every 15 seconds to stay connected without awareness', async t => {
		FakePhysicalWebSocket.instances = [];
		t.mock.timers.enable( { apis: [ 'setInterval' ] } );
		const providerCreator = createWebSocketConnection( 'wss://example.test/_ws/', {
			multiplexingEnabled: true,
			PhysicalWebSocket: FakePhysicalWebSocket as unknown as typeof WebSocket,
			fetchToken: () => Promise.resolve( 'grant' ),
			waitBeforeRetry: async () => {},
		} );
		track(
			await providerCreator( {
				objectType: 'root/comment',
				objectId: null,
				ydoc: new Yjs.Doc(),
				Y: Yjs,
			} )
		);
		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		acknowledgeRoom( physical, 'site-1/vip-rtc/collections-collection' );
		const sentBefore = physical.sent.length;

		t.mock.timers.tick( 15_000 );

		const resync = physical.sent.slice( sentBefore ).map( decodeMessage );
		assert.strictEqual( resync.length, 1 );
		assert.strictEqual( resync[ 0 ]?.type, 'data' );
		t.mock.timers.reset();
	} );
} );

function decodeRoom( bytes: Uint8Array ): string {
	// [version][type][varuint length][room]: room names here are under 128 bytes.
	const length = bytes[ 2 ] ?? 0;
	return new TextDecoder().decode( bytes.slice( 3, 3 + length ) );
}
