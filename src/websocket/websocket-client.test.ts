import * as encoding from 'lib0/encoding';
import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Awareness } from 'y-protocols/awareness';
import { writeSyncStep2 } from 'y-protocols/sync';
import { WebsocketProvider } from 'y-websocket';
import * as Yjs from 'yjs';

import { decodeMessage, encodeMessage } from '../../websocket-server/protocol';
import { createWebSocketConnection } from '../websocket-client';
import { acknowledgeRoom, FakePhysicalWebSocket } from './fake-physical-websocket.test-helper';

import type { ConnectionStatus, ProviderCreator, ProviderCreatorResult } from '@/types/sync';

let authFetchCount = 0;

interface ProviderContext {
	awareness: Awareness;
	doc: Yjs.Doc;
	result: ProviderCreatorResult;
	statuses: ConnectionStatus[];
}

interface ProviderLifecycleObserver {
	cleanup: () => void;
	destroyCount: () => number;
}

let activeContexts: ProviderContext[] = [];

beforeEach( () => {
	authFetchCount = 0;
	FakePhysicalWebSocket.instances = [];
	activeContexts = [];
} );

afterEach( () => {
	for ( const context of [ ...activeContexts ] ) {
		destroyProvider( context );
	}
	mock.restoreAll();
} );

async function createProvider(
	waitBeforeRetry: ( delayInMs: number ) => Promise< void > = async () => {},
	PhysicalWebSocket: typeof WebSocket = FakePhysicalWebSocket as unknown as typeof WebSocket,
	multiplexingEnabled = true
): Promise< ProviderContext > {
	const providerCreator = createWebSocketConnection( 'wss://example.test/_ws/', {
		multiplexingEnabled,
		PhysicalWebSocket,
		fetchToken: () => {
			authFetchCount += 1;
			return Promise.resolve( `grant-${ authFetchCount }` );
		},
		waitBeforeRetry,
	} );
	return createProviderFromCreator( providerCreator, '123' );
}

async function createProviderFromCreator(
	providerCreator: ProviderCreator,
	objectId: string
): Promise< ProviderContext > {
	const doc = new Yjs.Doc();
	const awareness = new Awareness( doc );
	const result = await providerCreator( {
		awareness,
		objectType: 'postType/page',
		objectId,
		ydoc: doc,
		Y: Yjs,
	} );
	const statuses: ConnectionStatus[] = [];
	result.on( 'status', status => statuses.push( status ) );
	const context = { awareness, doc, result, statuses };
	activeContexts.push( context );
	return context;
}

function observeProviderLifecycle(): ProviderLifecycleObserver {
	const providers = new Set< WebsocketProvider >();
	const destroyedProviders = new Set< WebsocketProvider >();
	// Called below with an explicit provider receiver.
	// eslint-disable-next-line @typescript-eslint/unbound-method
	const originalConnect = WebsocketProvider.prototype.connect;
	// Called below with an explicit provider receiver.
	// eslint-disable-next-line @typescript-eslint/unbound-method
	const originalDestroy = WebsocketProvider.prototype.destroy;

	mock.method( WebsocketProvider.prototype, 'connect', function ( this: WebsocketProvider ) {
		providers.add( this );
		return originalConnect.call( this );
	} );
	mock.method( WebsocketProvider.prototype, 'destroy', function ( this: WebsocketProvider ) {
		destroyedProviders.add( this );
		return originalDestroy.call( this );
	} );

	return {
		destroyCount: () => destroyedProviders.size,
		cleanup: () => {
			for ( const provider of providers ) {
				if ( ! destroyedProviders.has( provider ) ) {
					originalDestroy.call( provider );
				}
			}
		},
	};
}

function destroyProvider( context: ProviderContext ): void {
	const index = activeContexts.indexOf( context );
	if ( index !== -1 ) {
		activeContexts.splice( index, 1 );
	}
	context.result.destroy();
	context.awareness.destroy();
	context.doc.destroy();
}

function acknowledgeInitialRoom( physical: FakePhysicalWebSocket ): void {
	acknowledgeRoom( physical, 'site-1/postType/page-123' );
}

// The server's SyncStep2 reply makes y-websocket report `synced`.
function emitServerSyncStep2(
	socket: FakePhysicalWebSocket,
	doc: Yjs.Doc,
	multiplexingEnabled: boolean
): void {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint( encoder, 0 ); // y-websocket sync message.
	writeSyncStep2( encoder, doc );
	const payload = encoding.toUint8Array( encoder );
	socket.emitMessage(
		multiplexingEnabled
			? encodeMessage( { type: 'data', room: 'site-1/postType/page-123', payload } )
			: payload
	);
}

function lastStatus( statuses: ConnectionStatus[] ): ConnectionStatus {
	const status = statuses[ statuses.length - 1 ];
	assert.ok( status );
	return status;
}

describe( 'createWebSocketConnection multiplex lifecycle', () => {
	it( 'returns the provider while transient token outages retry with exponential backoff', async () => {
		mock.method( console, 'log', () => {} );
		const backoffDelays: number[] = [];
		const finishBackoffs: Array< () => void > = [];
		let fetchCount = 0;
		const providerCreator = createWebSocketConnection( 'wss://example.test/_ws/', {
			multiplexingEnabled: true,
			PhysicalWebSocket: FakePhysicalWebSocket as unknown as typeof WebSocket,
			fetchToken: () => {
				fetchCount += 1;
				return fetchCount <= 2
					? Promise.reject( new Error( 'temporary REST failure' ) )
					: Promise.resolve( 'fresh-grant' );
			},
			waitBeforeRetry: delayInMs =>
				new Promise( resolve => {
					backoffDelays.push( delayInMs );
					finishBackoffs.push( resolve );
				} ),
		} );

		const context = await createProviderFromCreator( providerCreator, '123' );
		assert.strictEqual( fetchCount, 1 );
		assert.strictEqual( FakePhysicalWebSocket.instances.length, 0 );

		const firstBackoff = finishBackoffs[ 0 ];
		assert.ok( firstBackoff );
		firstBackoff();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual( fetchCount, 2 );
		assert.deepStrictEqual( backoffDelays, [ 2000, 4000 ] );

		const secondBackoff = finishBackoffs[ 1 ];
		assert.ok( secondBackoff );
		secondBackoff();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual( fetchCount, 3 );
		assert.strictEqual( FakePhysicalWebSocket.instances.length, 1 );
		destroyProvider( context );
	} );

	it( 'does not reconnect after teardown during an in-flight token request', async () => {
		let resolveToken = ( _grant: string ): void => {};
		const inFlightToken = new Promise< string >( resolve => {
			resolveToken = resolve;
		} );
		let fetchCount = 0;
		const providerCreator = createWebSocketConnection( 'wss://example.test/_ws/', {
			multiplexingEnabled: true,
			PhysicalWebSocket: FakePhysicalWebSocket as unknown as typeof WebSocket,
			fetchToken: () => {
				fetchCount += 1;
				return fetchCount === 1 ? Promise.resolve( 'initial-grant' ) : inFlightToken;
			},
			waitBeforeRetry: async () => {},
		} );
		const context = await createProviderFromCreator( providerCreator, '123' );
		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		acknowledgeInitialRoom( physical );

		physical.emitClose( 1011 );
		await Promise.resolve();
		await Promise.resolve();
		assert.strictEqual( fetchCount, 2 );

		destroyProvider( context );
		resolveToken( 'stale-grant' );
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual( FakePhysicalWebSocket.instances.length, 1 );
	} );

	it( 'subscribes every provider over one physical socket regardless of bootstrap grant', async () => {
		const providerCreator = createWebSocketConnection( 'wss://example.test/_ws/', {
			multiplexingEnabled: true,
			PhysicalWebSocket: FakePhysicalWebSocket as unknown as typeof WebSocket,
			fetchToken: () => {
				authFetchCount += 1;
				return Promise.resolve( `grant-${ authFetchCount }` );
			},
			waitBeforeRetry: async () => {},
		} );
		await createProviderFromCreator( providerCreator, '123' );
		await createProviderFromCreator( providerCreator, '456' );

		assert.strictEqual( FakePhysicalWebSocket.instances.length, 1 );
		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		assert.deepStrictEqual( physical.sent.map( decodeMessage ), [
			{
				type: 'subscribe',
				room: 'site-1/postType/page-123',
				grant: 'grant-1',
			},
			{
				type: 'subscribe',
				room: 'site-1/postType/page-456',
				grant: 'grant-2',
			},
		] );
	} );

	it( 'creates native room-specific sockets when multiplexing is disabled', async () => {
		const providerCreator = createWebSocketConnection( 'wss://example.test/_ws/', {
			multiplexingEnabled: false,
			PhysicalWebSocket: FakePhysicalWebSocket as unknown as typeof WebSocket,
			fetchToken: () => {
				authFetchCount += 1;
				return Promise.resolve( `grant-${ authFetchCount }` );
			},
		} );
		await createProviderFromCreator( providerCreator, '123' );
		await createProviderFromCreator( providerCreator, '456' );

		assert.strictEqual( FakePhysicalWebSocket.instances.length, 2 );
		assert.deepStrictEqual(
			FakePhysicalWebSocket.instances.map( socket => socket.url ),
			[
				'wss://example.test/_ws/site-1/postType/page-123?auth=grant-1',
				'wss://example.test/_ws/site-1/postType/page-456?auth=grant-2',
			]
		);
		assert.deepStrictEqual(
			FakePhysicalWebSocket.instances.map( socket => socket.protocols ),
			[ [], [] ]
		);
	} );

	it( 'gates real y-websocket open and initial sync send on subscribed', async () => {
		const context = await createProvider();
		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );

		physical.emitOpen();
		assert.deepStrictEqual( physical.sent.map( decodeMessage ), [
			{
				type: 'subscribe',
				room: 'site-1/postType/page-123',
				grant: 'grant-1',
			},
		] );

		acknowledgeInitialRoom( physical );
		assert.strictEqual( context.statuses[ 0 ]?.status, 'connected' );
		const firstMessage = decodeMessage( physical.sent[ 1 ] ?? new Uint8Array() );
		assert.strictEqual( firstMessage.type, 'data' );
		assert.strictEqual( firstMessage.room, 'site-1/postType/page-123' );
		assert.ok( firstMessage.type === 'data' && firstMessage.payload.length > 0 );

		destroyProvider( context );
	} );

	for ( const multiplexingEnabled of [ true, false ] ) {
		const transport = multiplexingEnabled ? 'multiplex' : 'legacy';
		it( `keeps the collaborator-limit error on ${ transport } retry until the server syncs`, async () => {
			const context = await createProvider( undefined, undefined, multiplexingEnabled );
			const rejected = FakePhysicalWebSocket.instances[ 0 ];
			assert.ok( rejected );
			rejected.emitOpen();
			rejected.emitClose( 4003 );
			const limitStatus = lastStatus( context.statuses );
			assert.strictEqual( limitStatus.status, 'disconnected' );
			assert.strictEqual( limitStatus.error?.code, 'collaborator-limit-exceeded' );
			const statusesBeforeRetry = context.statuses.length;
			await Promise.resolve();
			await Promise.resolve();

			// A raw open (and room acknowledgment) must not clear the error.
			const retry = FakePhysicalWebSocket.instances[ 1 ];
			assert.ok( retry );
			retry.emitOpen();
			if ( multiplexingEnabled ) {
				acknowledgeInitialRoom( retry );
			}
			assert.deepStrictEqual( context.statuses.slice( statusesBeforeRetry ), [] );

			// Only a real sync clears the error, with exactly one event.
			emitServerSyncStep2( retry, context.doc, multiplexingEnabled );
			assert.deepStrictEqual( context.statuses.slice( statusesBeforeRetry ), [
				{ status: 'connected' },
			] );
		} );
	}

	it( 'keeps a non-limit error and its retry metadata while the retry connects', async () => {
		const context = await createProvider();
		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		acknowledgeInitialRoom( physical );

		physical.emitClose( 4001 );
		const expired = lastStatus( context.statuses );
		assert.strictEqual( expired.status, 'disconnected' );
		assert.strictEqual( expired.error?.code, 'connection-expired' );
		assert.strictEqual( expired.willAutoRetryInMs, 2000 );
		assert.strictEqual( expired.backgroundRetriesFailed, false );
		const statusesBeforeRetry = context.statuses.length;
		await Promise.resolve();
		await Promise.resolve();

		const retry = FakePhysicalWebSocket.instances[ 1 ];
		assert.ok( retry );
		retry.emitOpen();
		acknowledgeInitialRoom( retry );
		assert.deepStrictEqual( context.statuses.slice( statusesBeforeRetry ), [] );
	} );

	it( 'does not advertise retry after a terminal physical close', async t => {
		t.mock.timers.enable( { apis: [ 'setTimeout' ] } );
		let context: ProviderContext | undefined;
		try {
			context = await createProvider();
			const physical = FakePhysicalWebSocket.instances[ 0 ];
			assert.ok( physical );
			physical.emitOpen();
			acknowledgeInitialRoom( physical );

			physical.emitClose( 1002 );

			const status = lastStatus( context.statuses );
			assert.strictEqual( status.status, 'disconnected' );
			assert.strictEqual( status.error?.code, 'unknown-error' );
			assert.ok( ! ( 'willAutoRetryInMs' in status ) );
			assert.ok( ! ( 'backgroundRetriesFailed' in status ) );
			await Promise.resolve();
			await Promise.resolve();
			t.mock.timers.tick( 101 );
			await Promise.resolve();
			await Promise.resolve();
			assert.strictEqual( authFetchCount, 1 );
			assert.strictEqual( FakePhysicalWebSocket.instances.length, 1 );
		} finally {
			if ( context !== undefined ) {
				destroyProvider( context );
			}
			t.mock.timers.reset();
		}
	} );

	it( 'treats room 4002 as terminal unknown instead of a physical modal error', async () => {
		const context = await createProvider();
		try {
			const physical = FakePhysicalWebSocket.instances[ 0 ];
			assert.ok( physical );
			physical.emitOpen();
			acknowledgeInitialRoom( physical );

			physical.emitMessage(
				encodeMessage( {
					type: 'room_closed',
					room: 'site-1/postType/page-123',
					code: 4002,
				} )
			);

			const status = lastStatus( context.statuses );
			assert.strictEqual( status.status, 'disconnected' );
			assert.strictEqual( status.error?.code, 'unknown-error' );
			assert.ok( ! ( 'willAutoRetryInMs' in status ) );
			assert.ok( ! ( 'backgroundRetriesFailed' in status ) );
			await Promise.resolve();
			await Promise.resolve();
			assert.strictEqual( authFetchCount, 1 );
		} finally {
			destroyProvider( context );
		}
	} );

	it( 'cancels a pending room retry when the provider is destroyed during backoff', async () => {
		let finishBackoff = (): void => {};
		const backoff = new Promise< void >( resolve => {
			finishBackoff = resolve;
		} );
		const context = await createProvider( () => backoff );
		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		acknowledgeInitialRoom( physical );
		physical.emitMessage(
			encodeMessage( {
				type: 'room_closed',
				room: 'site-1/postType/page-123',
				code: 4005,
			} )
		);

		const statusCountBeforeDestroy = context.statuses.length;
		const status = lastStatus( context.statuses );
		assert.strictEqual( status.status, 'disconnected' );
		assert.strictEqual( status.error?.code, 'unknown-error' );
		assert.strictEqual( status.willAutoRetryInMs, 2000 );
		destroyProvider( context );
		finishBackoff();
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual( authFetchCount, 1 );
		assert.strictEqual( FakePhysicalWebSocket.instances.length, 1 );
		assert.strictEqual( context.statuses.length, statusCountBeforeDestroy );
	} );

	it( 'disposes a provider when initial physical construction is fatal', async () => {
		class ThrowingPhysicalWebSocket extends FakePhysicalWebSocket {
			public constructor( url: string | URL, protocols?: string | string[] ) {
				super( url, protocols );
				throw new Error( 'physical construction failed' );
			}
		}

		mock.method( console, 'log', () => {} );
		const lifecycle = observeProviderLifecycle();
		try {
			const context = await createProvider(
				async () => {},
				ThrowingPhysicalWebSocket as unknown as typeof WebSocket
			);

			assert.strictEqual( lifecycle.destroyCount(), 1 );
			assert.strictEqual( authFetchCount, 1 );
			destroyProvider( context );
		} finally {
			lifecycle.cleanup();
		}
	} );

	it( 'disposes a returned provider when background physical construction is fatal', async () => {
		class FailingReplacementWebSocket extends FakePhysicalWebSocket {
			public static constructions = 0;

			public constructor( url: string | URL, protocols?: string | string[] ) {
				FailingReplacementWebSocket.constructions += 1;
				if ( FailingReplacementWebSocket.constructions === 2 ) {
					throw new Error( 'replacement construction failed' );
				}
				super( url, protocols );
			}
		}

		mock.method( console, 'log', () => {} );
		const lifecycle = observeProviderLifecycle();
		try {
			const context = await createProvider(
				async () => {},
				FailingReplacementWebSocket as unknown as typeof WebSocket
			);
			const physical = FakePhysicalWebSocket.instances[ 0 ];
			assert.ok( physical );
			physical.emitOpen();
			acknowledgeInitialRoom( physical );
			physical.emitClose( 1011 );
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();

			assert.strictEqual( lifecycle.destroyCount(), 1 );
			assert.strictEqual( authFetchCount, 2 );
			context.result.destroy();
			assert.strictEqual( lifecycle.destroyCount(), 1 );
			destroyProvider( context );
		} finally {
			lifecycle.cleanup();
		}
	} );
} );
