import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';
import * as Yjs from 'yjs';

import { decodeMessage, encodeMessage } from '../../websocket-server/protocol';
import { createWebSocketConnection } from '../websocket-client';

import type { ConnectionStatus, ProviderCreator, ProviderCreatorResult } from '@wordpress/sync';

let authFetchCount = 0;

interface FakeCloseEvent extends Event {
	code: number;
}

class FakePhysicalWebSocket {
	public static readonly CONNECTING = 0;
	public static readonly OPEN = 1;
	public static readonly CLOSING = 2;
	public static readonly CLOSED = 3;

	public static instances: FakePhysicalWebSocket[] = [];

	public binaryType: BinaryType = 'blob';
	public readonly sent: Uint8Array[] = [];
	public readyState = FakePhysicalWebSocket.CONNECTING;
	public onclose: ( ( event: FakeCloseEvent ) => void ) | null = null;
	public onerror: ( ( event: Event ) => void ) | null = null;
	public onmessage: ( ( event: MessageEvent< ArrayBuffer > ) => void ) | null = null;
	public onopen: ( ( event: Event ) => void ) | null = null;

	public constructor(
		public readonly url: string | URL,
		public readonly protocols?: string | string[]
	) {
		FakePhysicalWebSocket.instances.push( this );
	}

	public send( data: ArrayBufferLike | ArrayBufferView ): void {
		let bytes: Uint8Array;
		if ( data instanceof Uint8Array ) {
			bytes = data;
		} else if ( ArrayBuffer.isView( data ) ) {
			bytes = new Uint8Array( data.buffer, data.byteOffset, data.byteLength );
		} else {
			bytes = new Uint8Array( data );
		}
		this.sent.push( new Uint8Array( bytes ) );
	}

	public close( code = 1000 ): void {
		this.readyState = FakePhysicalWebSocket.CLOSING;
		this.emitClose( code );
	}

	public emitOpen(): void {
		this.readyState = FakePhysicalWebSocket.OPEN;
		this.onopen?.( new Event( 'open' ) );
	}

	public emitMessage( message: Uint8Array ): void {
		const data = message.buffer.slice(
			message.byteOffset,
			message.byteOffset + message.byteLength
		) as ArrayBuffer;
		this.onmessage?.( new MessageEvent( 'message', { data } ) );
	}

	public emitClose( code: number ): void {
		if ( this.readyState === FakePhysicalWebSocket.CLOSED ) {
			return;
		}
		this.readyState = FakePhysicalWebSocket.CLOSED;
		this.onclose?.( Object.assign( new Event( 'close' ), { code } ) );
	}
}

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
	PhysicalWebSocket: typeof WebSocket = FakePhysicalWebSocket as unknown as typeof WebSocket
): Promise< ProviderContext > {
	const providerCreator = createWebSocketConnection( 'wss://example.test/_ws/', {
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
	physical.emitMessage( encodeMessage( { type: 'subscribed', room: 'site-1/postType/page-123' } ) );
}

function lastStatus( statuses: ConnectionStatus[] ): ConnectionStatus {
	const status = statuses[ statuses.length - 1 ];
	assert.ok( status );
	return status;
}

describe( 'createWebSocketConnection multiplex lifecycle', () => {
	it( 'shares one physical socket across providers from the same creator', async () => {
		const providerCreator = createWebSocketConnection( 'wss://example.test/_ws/', {
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
		assert.deepStrictEqual( decodeMessage( physical.sent[ 0 ] ?? new Uint8Array() ), {
			type: 'subscribe',
			room: 'site-1/postType/page-456',
			grant: 'grant-2',
		} );
	} );

	it( 'gates real y-websocket open and initial sync send on subscribed', async () => {
		const context = await createProvider();
		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );

		physical.emitOpen();
		assert.deepStrictEqual( physical.sent, [] );

		acknowledgeInitialRoom( physical );
		assert.strictEqual( context.statuses[ 0 ]?.status, 'connected' );
		const firstMessage = decodeMessage( physical.sent[ 0 ] ?? new Uint8Array() );
		assert.strictEqual( firstMessage.type, 'data' );
		assert.strictEqual( firstMessage.room, 'site-1/postType/page-123' );
		assert.ok( firstMessage.type === 'data' && firstMessage.payload.length > 0 );

		destroyProvider( context );
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
		const consoleLogs: unknown[][] = [];
		mock.method( console, 'log', ( ...args: unknown[] ) => {
			consoleLogs.push( args );
		} );
		const context = await createProvider();
		try {
			const physical = FakePhysicalWebSocket.instances[ 0 ];
			assert.ok( physical );
			physical.emitOpen();
			acknowledgeInitialRoom( physical );
			consoleLogs.length = 0;

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
			assert.deepStrictEqual( consoleLogs, [
				[
					'[vip-rtc:websocket-client][ERROR]',
					'WebSocket room connection closed',
					{
						room: 'site-1/postType/page-123',
						closeCode: 4002,
						willRetry: false,
					},
				],
			] );
			await Promise.resolve();
			await Promise.resolve();
			assert.strictEqual( authFetchCount, 1 );
		} finally {
			destroyProvider( context );
		}
	} );

	it( 'logs a retryable room failure before destroy cancels its pending retry', async () => {
		const consoleLogs: unknown[][] = [];
		mock.method( console, 'log', ( ...args: unknown[] ) => {
			consoleLogs.push( args );
		} );
		let finishBackoff = (): void => {};
		const backoff = new Promise< void >( resolve => {
			finishBackoff = resolve;
		} );
		const context = await createProvider( () => backoff );
		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		acknowledgeInitialRoom( physical );
		consoleLogs.length = 0;
		physical.emitMessage(
			encodeMessage( {
				type: 'room_closed',
				room: 'site-1/postType/page-123',
				code: 4005,
			} )
		);

		const statusCountBeforeDestroy = context.statuses.length;
		assert.deepStrictEqual( consoleLogs[ 0 ], [
			'[vip-rtc:websocket-client][WARNING]',
			'WebSocket room connection closed',
			{
				room: 'site-1/postType/page-123',
				closeCode: 4005,
				willRetry: true,
			},
		] );
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
