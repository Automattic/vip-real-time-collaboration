import { docs, setPersistence } from '@y/websocket-server/utils';
import jwt from 'jsonwebtoken';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { afterEach, describe, it } from 'node:test';
import { register } from 'prom-client';
import { WebSocket } from 'ws';

import { WEBSOCKET_CLOSE_CODES } from './config';
import { MultiplexSession } from './multiplex-session';
import { NoopPersistenceProvider } from './noop-persistence-provider';
import { decodeMessage, encodeMessage, type DataMessage, type ProtocolMessage } from './protocol';
import { RoomWebSocket } from './room-websocket';

import type { SyncTokenPayload } from './auth';
import type { HeartbeatScheduler } from './physical-heartbeat';
import type { IncomingMessage } from 'node:http';
import type { Data } from 'ws';

const JWT_SECRET = 'multiplex-test-secret';
const physicalSockets = new Set< RecordingPhysicalSocket >();

function grant( payload: Partial< SyncTokenPayload > = {}, secret = JWT_SECRET ): string {
	return jwt.sign(
		{
			blog_id: 7,
			room_name: 'site-7/post-1',
			user_id: 42,
			username: 'test-user',
			wp_client_id: 'client-1',
			...payload,
		},
		secret
	);
}

function tokenPayload( overrides: Partial< SyncTokenPayload > = {} ): SyncTokenPayload {
	return {
		blog_id: 7,
		room_name: 'site-7/post-1',
		user_id: 42,
		username: 'test-user',
		wp_client_id: 'client-1',
		...overrides,
	};
}

class RecordingPhysicalSocket extends EventEmitter {
	public readonly sent: Array< Data | Uint8Array > = [];
	public readyState: number = WebSocket.OPEN;
	public closeCode: number | undefined;
	public delayCloseEvent = false;
	public pingCalls = 0;
	public terminateCalls = 0;
	public nextCallbackError: Error | undefined;
	public nextSendThrow: Error | undefined;
	public deferSendCallbacks = false;
	private readonly pendingSendCallbacks: Array< () => void > = [];

	public send(
		data: Data | Uint8Array,
		_options?: { binary?: boolean },
		callback?: ( error?: Error ) => void
	): void {
		if ( this.nextSendThrow ) {
			const error = this.nextSendThrow;
			this.nextSendThrow = undefined;
			throw error;
		}
		this.sent.push( data );
		const callbackError = this.nextCallbackError;
		this.nextCallbackError = undefined;
		if ( callback ) {
			const complete = (): void => callback( callbackError );
			if ( this.deferSendCallbacks ) {
				this.pendingSendCallbacks.push( complete );
				return;
			}
			complete();
		}
	}

	public close( code = 1000 ): void {
		if ( this.readyState === WebSocket.CLOSED ) {
			return;
		}
		this.closeCode = code;
		if ( this.delayCloseEvent ) {
			this.readyState = WebSocket.CLOSING;
			return;
		}
		this.readyState = WebSocket.CLOSED;
		this.emit( 'close', code, Buffer.alloc( 0 ) );
	}

	public ping(): void {
		this.pingCalls += 1;
	}

	public terminate(): void {
		this.terminateCalls += 1;
		this.close( 1006 );
	}

	public receive( message: ProtocolMessage ): void {
		this.emit( 'message', encodeMessage( message ), true );
	}

	public flushSendCallbacks(): void {
		for ( const complete of this.pendingSendCallbacks.splice( 0 ) ) {
			complete();
		}
	}
}

class ManualHeartbeatScheduler implements HeartbeatScheduler {
	public readonly callbacks = new Set< () => void >();
	public clearCalls = 0;

	public setInterval(
		callback: () => void,
		_intervalMs: number
	): ReturnType< typeof setInterval > {
		this.callbacks.add( callback );
		return callback as unknown as ReturnType< typeof setInterval >;
	}

	public clearInterval( handle: ReturnType< typeof setInterval > ): void {
		this.clearCalls += 1;
		this.callbacks.delete( handle as unknown as () => void );
	}

	public tick(): void {
		for ( const callback of Array.from( this.callbacks ) ) {
			callback();
		}
	}
}

function createSession(
	initialPayload: SyncTokenPayload = tokenPayload(),
	heartbeatScheduler?: HeartbeatScheduler
): {
	physical: RecordingPhysicalSocket;
	session: MultiplexSession;
} {
	setPersistence( new NoopPersistenceProvider() );
	const physical = new RecordingPhysicalSocket();
	physicalSockets.add( physical );
	const request = { url: `/${ initialPayload.room_name }` } as IncomingMessage;
	const session = new MultiplexSession(
		physical as unknown as WebSocket,
		request,
		initialPayload,
		JWT_SECRET,
		heartbeatScheduler
	);
	return { physical, session };
}

afterEach( async () => {
	for ( const physical of physicalSockets ) {
		physical.delayCloseEvent = false;
		physical.close();
	}
	physicalSockets.clear();
	await Promise.resolve();
} );

function decoded( physical: RecordingPhysicalSocket ): ProtocolMessage[] {
	return physical.sent.map( message => decodeMessage( message as Uint8Array ) );
}

function assertDataMessage( message: ProtocolMessage | undefined ): asserts message is DataMessage {
	assert.ok( message );
	assert.strictEqual( message.type, 'data' );
}

function activeRoomSocket( room: string ): RoomWebSocket {
	const document = docs.get( room );
	assert.ok( document );
	const [ roomSocket ] = document.conns.keys();
	assert.ok( roomSocket );
	return roomSocket as unknown as RoomWebSocket;
}

async function activeRoomMetric(): Promise< number > {
	const metric = await register.getSingleMetricAsString( 'wpvip_rtc_active_rooms' );
	const match = metric.match( /^wpvip_rtc_active_rooms (\d+)$/m );
	assert.ok( match );
	return Number( match[ 1 ] );
}

describe( 'MultiplexSession', () => {
	it( 'defines the retryable room-interruption close code', () => {
		assert.match( WEBSOCKET_CLOSE_CODES.get( 4005 ) ?? '', /reconnect/i );
	} );

	it( 'describes a 4004 close as a room subscription rejection', () => {
		assert.match( WEBSOCKET_CLOSE_CODES.get( 4004 ) ?? '', /subscription/i );
	} );

	it( 'uses one responsive physical heartbeat for multiple rooms', () => {
		const scheduler = new ManualHeartbeatScheduler();
		const { physical, session } = createSession( tokenPayload(), scheduler );
		session.start();
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );

		scheduler.tick();
		physical.emit( 'pong', Buffer.alloc( 0 ) );
		scheduler.tick();
		const actual = {
			pingCalls: physical.pingCalls,
			readyState: physical.readyState,
			scheduledHeartbeats: scheduler.callbacks.size,
		};
		physical.close();

		assert.strictEqual( actual.scheduledHeartbeats, 1 );
		assert.strictEqual( actual.pingCalls, 2 );
		assert.strictEqual( actual.readyState, WebSocket.OPEN );
	} );

	it( 'terminates the physical socket when a pong is missed', () => {
		const scheduler = new ManualHeartbeatScheduler();
		const { physical, session } = createSession( tokenPayload(), scheduler );
		session.start();

		scheduler.tick();
		scheduler.tick();
		const actual = {
			callbacks: scheduler.callbacks.size,
			readyState: physical.readyState,
			terminateCalls: physical.terminateCalls,
		};
		physical.close();

		assert.strictEqual( actual.terminateCalls, 1 );
		assert.strictEqual( actual.readyState, WebSocket.CLOSED );
		assert.strictEqual( actual.callbacks, 0 );
	} );

	it( 'stops the physical heartbeat when the socket closes', () => {
		const scheduler = new ManualHeartbeatScheduler();
		const { physical, session } = createSession( tokenPayload(), scheduler );
		session.start();

		physical.close();
		scheduler.tick();

		assert.strictEqual( scheduler.clearCalls, 1 );
		assert.strictEqual( scheduler.callbacks.size, 0 );
		assert.strictEqual( physical.pingCalls, 0 );
	} );

	it( 'acknowledges the initial room before forwarding initial Yjs data', () => {
		const { physical, session } = createSession();

		session.start();

		const messages = decoded( physical );
		assert.deepStrictEqual( messages[ 0 ], { type: 'subscribed', room: 'site-7/post-1' } );
		assertDataMessage( messages[ 1 ] );
		assert.strictEqual( messages[ 1 ].room, 'site-7/post-1' );
		physical.close();
	} );

	it( 'preserves initial wire ordering before a deferred subscribed callback error closes the session', () => {
		const room = 'site-7/deferred-initial-control';
		const { physical, session } = createSession( tokenPayload( { room_name: room } ) );
		physical.deferSendCallbacks = true;
		physical.nextCallbackError = new Error( 'deferred subscribed send failure' );

		session.start();

		const messagesBeforeFlush = decoded( physical );
		assert.deepStrictEqual( messagesBeforeFlush[ 0 ], { type: 'subscribed', room } );
		assertDataMessage( messagesBeforeFlush[ 1 ] );
		assert.strictEqual( messagesBeforeFlush[ 1 ].room, room );
		physical.flushSendCallbacks();

		assert.strictEqual( physical.closeCode, 1011 );
		assert.strictEqual( docs.has( room ), false );
	} );

	for ( const failureMode of [ 'callback', 'throw' ] as const ) {
		const failureDescription = failureMode === 'callback' ? 'callback error' : 'synchronous throw';
		it( `closes shared transport with 1011 after an initial subscribed send ${ failureDescription }`, () => {
			const room = `site-7/initial-control-${ failureMode }`;
			const { physical, session } = createSession( tokenPayload( { room_name: room } ) );
			const sendError = new Error( `initial subscribed send ${ failureMode }` );
			if ( failureMode === 'callback' ) {
				physical.nextCallbackError = sendError;
			} else {
				physical.nextSendThrow = sendError;
			}
			let thrown: unknown;

			try {
				session.start();
			} catch ( error ) {
				thrown = error;
			}

			const actual = {
				closeCode: physical.closeCode,
				messages: decoded( physical ),
				roomActive: docs.has( room ),
				thrown,
			};
			physical.close();

			assert.strictEqual( actual.thrown, undefined );
			assert.strictEqual( actual.closeCode, 1011 );
			assert.strictEqual( actual.roomActive, false );
			assert.deepStrictEqual(
				actual.messages.filter( message => message.type === 'data' ),
				[]
			);
			assert.deepStrictEqual(
				actual.messages.filter( message => message.type === 'room_closed' ),
				[]
			);
		} );
	}

	it( 'acknowledges a later authorized room before forwarding its initial Yjs data', () => {
		const { physical, session } = createSession();
		session.start();
		physical.sent.splice( 0 );

		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );

		const messages = decoded( physical );
		assert.deepStrictEqual( messages[ 0 ], { type: 'subscribed', room: 'site-7/post-2' } );
		assertDataMessage( messages[ 1 ] );
		assert.strictEqual( messages[ 1 ].room, 'site-7/post-2' );
		physical.close();
	} );

	it( 'routes authorized room data through the normal y-websocket message path', () => {
		const { physical, session } = createSession();
		session.start();
		const initialSync = decoded( physical )[ 1 ];
		assertDataMessage( initialSync );
		const document = docs.get( 'site-7/post-1' );
		assert.ok( document );
		assert.strictEqual( document.conns.size, 1 );

		physical.receive( {
			type: 'data',
			room: 'site-7/post-1',
			payload: initialSync.payload,
		} );

		assert.strictEqual( physical.readyState, WebSocket.OPEN );
		physical.close();
	} );

	for ( const [ name, overrides ] of [
		[ 'user_id', { user_id: 99 } ],
		[ 'effective wp_client_id', { wp_client_id: 'other-client' } ],
		[ 'fallback connection_id', { wp_client_id: undefined, connection_id: 'other-client' } ],
		[ 'blog_id', { blog_id: 8 } ],
	] as const ) {
		it( `rejects a subscription whose ${ name } differs without closing active rooms`, () => {
			const { physical, session } = createSession();
			session.start();
			physical.sent.splice( 0 );

			physical.receive( {
				type: 'subscribe',
				room: 'site-7/post-2',
				grant: grant( { room_name: 'site-7/post-2', ...overrides } ),
			} );

			assert.deepStrictEqual( decoded( physical ), [
				{ type: 'room_closed', room: 'site-7/post-2', code: 4004 },
			] );
			assert.strictEqual( physical.readyState, WebSocket.OPEN );
			assert.strictEqual( docs.get( 'site-7/post-1' )?.conns.size, 1 );
			physical.close();
		} );
	}

	for ( const [ description, laterGrant ] of [
		[ 'a malformed', 'not-a-jwt' ],
		[ 'a wrong-secret', grant( { room_name: 'site-7/post-2' }, 'wrong-secret' ) ],
	] as const ) {
		it( `rejects ${ description } later grant without closing existing rooms`, () => {
			const { physical, session } = createSession();
			session.start();
			physical.sent.splice( 0 );

			physical.receive( {
				type: 'subscribe',
				room: 'site-7/post-2',
				grant: laterGrant,
			} );

			assert.deepStrictEqual( decoded( physical ), [
				{ type: 'room_closed', room: 'site-7/post-2', code: 4004 },
			] );
			assert.strictEqual( physical.readyState, WebSocket.OPEN );
			assert.strictEqual( docs.get( 'site-7/post-1' )?.conns.size, 1 );
			physical.close();
		} );
	}

	for ( const [ description, laterGrant ] of [
		[
			'an expired',
			grant( {
				room_name: 'site-7/post-2',
				exp: Math.floor( Date.now() / 1000 ) - 60,
			} ),
		],
	] as const ) {
		it( `rejects a later grant ${ description } with a retryable room close`, () => {
			const { physical, session } = createSession();
			session.start();
			physical.sent.splice( 0 );

			physical.receive( {
				type: 'subscribe',
				room: 'site-7/post-2',
				grant: laterGrant,
			} );

			assert.deepStrictEqual( decoded( physical ), [
				{ type: 'room_closed', room: 'site-7/post-2', code: 4005 },
			] );
			assert.strictEqual( physical.readyState, WebSocket.OPEN );
			assert.strictEqual( docs.get( 'site-7/post-1' )?.conns.size, 1 );
			physical.close();
		} );
	}

	it( 'rejects an expired later grant with an invalid payload as terminal', () => {
		const { physical, session } = createSession();
		session.start();
		physical.sent.splice( 0 );

		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( {
				exp: Math.floor( Date.now() / 1000 ) - 60,
				room_name: 'site-7/post-2',
				user_id: undefined,
			} ),
		} );

		const actual = {
			messages: decoded( physical ),
			readyState: physical.readyState,
		};
		physical.close();

		assert.deepStrictEqual( actual.messages, [
			{ type: 'room_closed', room: 'site-7/post-2', code: 4004 },
		] );
		assert.strictEqual( actual.readyState, WebSocket.OPEN );
	} );

	for ( const [ description, overrides ] of [
		[ 'a room mismatch', { room_name: 'site-7/post-3' } ],
		[ 'an identity mismatch', { room_name: 'site-7/post-2', user_id: 99 } ],
	] as const ) {
		it( `routes an expired later grant with ${ description } through authorization bypass`, async () => {
			const baseline = await activeRoomMetric();
			const { physical, session } = createSession();
			session.start();
			physical.sent.splice( 0 );
			const expiredGrant = grant( {
				exp: Math.floor( Date.now() / 1000 ) - 60,
				...overrides,
			} );
			physical.delayCloseEvent = true;

			for ( let attempt = 0; attempt < 2; attempt += 1 ) {
				physical.receive( {
					type: 'subscribe',
					room: 'site-7/post-2',
					grant: expiredGrant,
				} );
			}

			const actual = {
				closeCode: physical.closeCode,
				messages: decoded( physical ),
				postOneActive: docs.has( 'site-7/post-1' ),
				postTwoActive: docs.has( 'site-7/post-2' ),
				readyState: physical.readyState,
				roomMetric: await activeRoomMetric(),
			};
			physical.delayCloseEvent = false;
			physical.close( 1008 );

			assert.deepStrictEqual( actual.messages, [
				{ type: 'room_closed', room: 'site-7/post-2', code: 4004 },
				{ type: 'room_closed', room: 'site-7/post-2', code: 4004 },
			] );
			assert.strictEqual( actual.closeCode, 1008 );
			assert.strictEqual( actual.readyState, WebSocket.CLOSING );
			assert.strictEqual( actual.postOneActive, false );
			assert.strictEqual( actual.postTwoActive, false );
			assert.strictEqual( actual.roomMetric, baseline );
		} );
	}

	it( 'keeps the physical connection open after multiple expired room grants', () => {
		const { physical, session } = createSession();
		session.start();
		physical.sent.splice( 0 );
		const expiredAt = Math.floor( Date.now() / 1000 ) - 60;

		for ( const room of [ 'site-7/post-2', 'site-7/post-3' ] ) {
			physical.receive( {
				type: 'subscribe',
				room,
				grant: grant( { room_name: room, exp: expiredAt } ),
			} );
		}

		assert.deepStrictEqual( decoded( physical ), [
			{ type: 'room_closed', room: 'site-7/post-2', code: 4005 },
			{ type: 'room_closed', room: 'site-7/post-3', code: 4005 },
		] );
		assert.strictEqual( physical.readyState, WebSocket.OPEN );
		assert.strictEqual( docs.get( 'site-7/post-1' )?.conns.size, 1 );
		physical.close();
	} );

	it( 'closes the physical connection after repeated valid-grant identity mismatches', () => {
		const { physical, session } = createSession();
		session.start();
		physical.sent.splice( 0 );

		for ( const room of [ 'site-7/post-2', 'site-7/post-3' ] ) {
			physical.receive( {
				type: 'subscribe',
				room,
				grant: grant( { room_name: room, user_id: 99 } ),
			} );
		}

		assert.strictEqual( physical.closeCode, 1008 );
	} );

	it( 'requires the requested room to exactly match the verified room_name', () => {
		const { physical, session } = createSession();
		session.start();
		physical.sent.splice( 0 );

		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-3' } ),
		} );

		assert.deepStrictEqual( decoded( physical ), [
			{ type: 'room_closed', room: 'site-7/post-2', code: 4004 },
		] );
		physical.close();
	} );

	it( 'rejects a duplicate subscription only for that room through normal cleanup', async () => {
		const baseline = await activeRoomMetric();
		const { physical, session } = createSession();
		session.start();
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		const document = docs.get( 'site-7/post-2' );
		assert.ok( document );
		physical.sent.splice( 0 );

		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		await Promise.resolve();

		const actual = {
			closeCode: physical.closeCode,
			messages: decoded( physical ),
			postOneConnections: docs.get( 'site-7/post-1' )?.conns.size,
			postTwoActive: docs.has( 'site-7/post-2' ),
			readyState: physical.readyState,
			roomMetric: await activeRoomMetric(),
		};
		physical.close();

		assert.deepStrictEqual( actual.messages, [
			{ type: 'room_closed', room: 'site-7/post-2', code: 4004 },
		] );
		assert.strictEqual( actual.closeCode, undefined );
		assert.strictEqual( actual.readyState, WebSocket.OPEN );
		assert.strictEqual( actual.postOneConnections, 1 );
		assert.strictEqual( actual.postTwoActive, false );
		assert.strictEqual( actual.roomMetric, baseline + 1 );
	} );

	it( 'closes an unsubscribed room through the normal adapter cleanup path', async () => {
		const { physical, session } = createSession();
		session.start();
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );

		physical.receive( { type: 'unsubscribe', room: 'site-7/post-2' } );
		await Promise.resolve();

		assert.strictEqual( docs.has( 'site-7/post-2' ), false );
		assert.strictEqual( docs.get( 'site-7/post-1' )?.conns.size, 1 );
		physical.close();
	} );

	it( 'keeps unknown unsubscribe idempotent without creating a closed-room marker', () => {
		const { physical, session } = createSession();
		session.start();
		physical.sent.splice( 0 );

		physical.receive( { type: 'unsubscribe', room: 'site-7/post-99' } );
		physical.receive( { type: 'unsubscribe', room: 'site-7/post-99' } );
		physical.receive( {
			type: 'data',
			room: 'site-7/post-99',
			payload: Uint8Array.from( [ 0 ] ),
		} );

		assert.deepStrictEqual( decoded( physical ), [
			{ type: 'room_closed', room: 'site-7/post-99', code: 4004 },
		] );
		assert.strictEqual( physical.readyState, WebSocket.OPEN );
		assert.strictEqual( docs.get( 'site-7/post-1' )?.conns.size, 1 );
		physical.close();
	} );

	it( 'rejects unauthorized room data and closes repeated bypass attempts', () => {
		const { physical, session } = createSession();
		session.start();
		physical.sent.splice( 0 );

		const unauthorizedData = {
			type: 'data' as const,
			room: 'site-7/post-99',
			payload: Uint8Array.from( [ 0 ] ),
		};
		physical.receive( unauthorizedData );
		assert.deepStrictEqual( decoded( physical ), [
			{ type: 'room_closed', room: 'site-7/post-99', code: 4004 },
		] );
		assert.strictEqual( physical.readyState, WebSocket.OPEN );

		physical.receive( unauthorizedData );
		assert.strictEqual( physical.closeCode, 1008 );
	} );

	it( 'drops late data for an authorized closed room without consuming bypass budget', () => {
		const { physical, session } = createSession();
		session.start();
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		physical.receive( { type: 'unsubscribe', room: 'site-7/post-2' } );
		physical.sent.splice( 0 );

		for ( let attempt = 0; attempt < 3; attempt += 1 ) {
			physical.receive( {
				type: 'data',
				room: 'site-7/post-2',
				payload: Uint8Array.from( [ 0 ] ),
			} );
		}
		physical.receive( {
			type: 'data',
			room: 'site-7/post-never-authorized',
			payload: Uint8Array.from( [ 0 ] ),
		} );

		assert.deepStrictEqual( decoded( physical ), [
			{ type: 'room_closed', room: 'site-7/post-never-authorized', code: 4004 },
		] );
		assert.strictEqual( physical.readyState, WebSocket.OPEN );
		physical.close();
	} );

	it( 'ignores buffered messages after an externally initiated close starts', async () => {
		const baseline = await activeRoomMetric();
		const { physical, session } = createSession();
		session.start();
		const initialSync = decoded( physical )[ 1 ];
		assertDataMessage( initialSync );
		physical.sent.splice( 0 );
		physical.delayCloseEvent = true;
		physical.close( 4001 );

		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		physical.receive( {
			type: 'data',
			room: 'site-7/post-1',
			payload: initialSync.payload,
		} );

		assert.deepStrictEqual( decoded( physical ), [] );
		assert.strictEqual( docs.has( 'site-7/post-1' ), false );
		assert.strictEqual( docs.has( 'site-7/post-2' ), false );
		assert.strictEqual( await activeRoomMetric(), baseline );
	} );

	it( 'clears the closed-room marker after an authorized resubscribe and routes data', () => {
		const { physical, session } = createSession();
		session.start();
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		physical.receive( { type: 'unsubscribe', room: 'site-7/post-2' } );
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		const roomSync = decoded( physical ).find(
			message => message.type === 'data' && message.room === 'site-7/post-2'
		);
		assertDataMessage( roomSync );
		const roomSocket = activeRoomSocket( 'site-7/post-2' );
		let routedMessages = 0;
		roomSocket.on( 'message', () => {
			routedMessages += 1;
		} );

		physical.receive( {
			type: 'data',
			room: 'site-7/post-2',
			payload: roomSync.payload,
		} );

		assert.strictEqual( routedMessages, 1 );
		assert.strictEqual( physical.readyState, WebSocket.OPEN );
		physical.close();
	} );

	it( 'reports an unexpected adapter close as retryable without harming another room', () => {
		const { physical, session } = createSession();
		session.start();
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		physical.sent.splice( 0 );

		activeRoomSocket( 'site-7/post-2' ).close();

		assert.deepStrictEqual( decoded( physical ), [
			{ type: 'room_closed', room: 'site-7/post-2', code: 4005 },
		] );
		assert.strictEqual( physical.readyState, WebSocket.OPEN );
		assert.strictEqual( docs.has( 'site-7/post-2' ), false );
		assert.strictEqual( docs.get( 'site-7/post-1' )?.conns.size, 1 );
		physical.close();
	} );

	for ( const failureMode of [ 'callback', 'throw' ] as const ) {
		const failureDescription = failureMode === 'callback' ? 'callback error' : 'synchronous throw';
		it( `closes shared transport with 1011 after a room_closed send ${ failureDescription }`, () => {
			const initialRoom = `site-7/control-peer-${ failureMode }`;
			const closingRoom = `site-7/control-close-${ failureMode }`;
			const { physical, session } = createSession( tokenPayload( { room_name: initialRoom } ) );
			session.start();
			physical.receive( {
				type: 'subscribe',
				room: closingRoom,
				grant: grant( { room_name: closingRoom } ),
			} );
			physical.sent.splice( 0 );
			const sendError = new Error( `room_closed send ${ failureMode }` );
			if ( failureMode === 'callback' ) {
				physical.nextCallbackError = sendError;
			} else {
				physical.nextSendThrow = sendError;
			}
			let thrown: unknown;

			try {
				activeRoomSocket( closingRoom ).close();
			} catch ( error ) {
				thrown = error;
			}

			const actual = {
				closeCode: physical.closeCode,
				messages: decoded( physical ),
				peerRoomActive: docs.has( initialRoom ),
				closedRoomActive: docs.has( closingRoom ),
				thrown,
			};
			physical.close();

			assert.strictEqual( actual.thrown, undefined );
			assert.strictEqual( actual.closeCode, 1011 );
			assert.strictEqual( actual.peerRoomActive, false );
			assert.strictEqual( actual.closedRoomActive, false );
			assert.deepStrictEqual(
				actual.messages.filter( message => message.type === 'room_closed' ),
				failureMode === 'callback' ? [ { type: 'room_closed', room: closingRoom, code: 4005 } ] : []
			);
		} );
	}

	for ( const failureMode of [ 'callback', 'throw' ] as const ) {
		it( `closes shared transport with 1011 after a physical send ${ failureMode }`, () => {
			const { physical, session } = createSession();
			session.start();
			physical.receive( {
				type: 'subscribe',
				room: 'site-7/post-2',
				grant: grant( { room_name: 'site-7/post-2' } ),
			} );
			physical.sent.splice( 0 );
			const sendError = new Error( `physical send ${ failureMode }` );
			if ( failureMode === 'callback' ) {
				physical.nextCallbackError = sendError;
			} else {
				physical.nextSendThrow = sendError;
			}

			activeRoomSocket( 'site-7/post-2' ).send( Uint8Array.from( [ 0 ] ) );

			assert.strictEqual( physical.closeCode, 1011 );
			assert.strictEqual( docs.has( 'site-7/post-1' ), false );
			assert.strictEqual( docs.has( 'site-7/post-2' ), false );
			assert.deepStrictEqual(
				decoded( physical ).filter( message => message.type === 'room_closed' ),
				[]
			);
		} );
	}

	it( 'closes malformed physical framing', () => {
		const { physical, session } = createSession();
		session.start();

		physical.emit( 'message', Buffer.from( [ 0xff ] ), true );

		assert.strictEqual( physical.closeCode, 1002 );
	} );

	for ( const [ description, expectedCode, failSession ] of [
		[
			'non-binary framing',
			1002,
			( physical: RecordingPhysicalSocket ) => {
				physical.emit( 'message', Buffer.from( [ 0xff ] ), false );
			},
		],
		[
			'repeated authorization bypass',
			1008,
			( physical: RecordingPhysicalSocket ) => {
				const unauthorizedData = {
					type: 'data' as const,
					room: 'site-7/post-never-authorized',
					payload: Uint8Array.from( [ 0 ] ),
				};
				physical.receive( unauthorizedData );
				physical.receive( unauthorizedData );
			},
		],
		[
			'physical send failure',
			1011,
			( physical: RecordingPhysicalSocket ) => {
				physical.nextCallbackError = new Error( 'physical send failure' );
				activeRoomSocket( 'site-7/post-2' ).send( Uint8Array.from( [ 0 ] ) );
			},
		],
		[
			'control send failure',
			1011,
			( physical: RecordingPhysicalSocket ) => {
				physical.nextCallbackError = new Error( 'control send failure' );
				activeRoomSocket( 'site-7/post-2' ).close();
			},
		],
	] as const ) {
		it( `cleans every logical room after ${ description } without waiting for a physical close event`, async () => {
			const baseline = await activeRoomMetric();
			const { physical, session } = createSession();
			session.start();
			physical.receive( {
				type: 'subscribe',
				room: 'site-7/post-2',
				grant: grant( { room_name: 'site-7/post-2' } ),
			} );
			physical.sent.splice( 0 );
			physical.delayCloseEvent = true;

			failSession( physical );
			const actual = {
				closeCode: physical.closeCode,
				postOneActive: docs.has( 'site-7/post-1' ),
				postTwoActive: docs.has( 'site-7/post-2' ),
				readyState: physical.readyState,
				roomMetric: await activeRoomMetric(),
			};
			physical.delayCloseEvent = false;
			physical.close( expectedCode );

			assert.strictEqual( actual.closeCode, expectedCode );
			assert.strictEqual( actual.readyState, WebSocket.CLOSING );
			assert.strictEqual( actual.postOneActive, false );
			assert.strictEqual( actual.postTwoActive, false );
			assert.strictEqual( actual.roomMetric, baseline );
		} );
	}

	it( 'cleans rooms after a send failure while the physical socket is closing', async () => {
		const baseline = await activeRoomMetric();
		const { physical, session } = createSession();
		session.start();
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		physical.delayCloseEvent = true;
		physical.close( 1008 );
		physical.nextCallbackError = new Error( 'send failure while closing' );

		activeRoomSocket( 'site-7/post-2' ).send( Uint8Array.from( [ 0 ] ) );

		const actual = {
			closeCode: physical.closeCode,
			postOneActive: docs.has( 'site-7/post-1' ),
			postTwoActive: docs.has( 'site-7/post-2' ),
			readyState: physical.readyState,
			roomMetric: await activeRoomMetric(),
		};
		physical.delayCloseEvent = false;
		physical.close( 1008 );

		assert.strictEqual( actual.closeCode, 1008 );
		assert.strictEqual( actual.readyState, WebSocket.CLOSING );
		assert.strictEqual( actual.postOneActive, false );
		assert.strictEqual( actual.postTwoActive, false );
		assert.strictEqual( actual.roomMetric, baseline );
	} );

	for ( const closeCode of [ 1000, 1006 ] ) {
		it( `cleans every room after physical close ${ closeCode }`, async () => {
			const { physical, session } = createSession();
			session.start();
			physical.receive( {
				type: 'subscribe',
				room: 'site-7/post-2',
				grant: grant( { room_name: 'site-7/post-2' } ),
			} );

			physical.close( closeCode );
			await Promise.resolve();

			assert.strictEqual( docs.has( 'site-7/post-1' ), false );
			assert.strictEqual( docs.has( 'site-7/post-2' ), false );
		} );
	}

	it( 'updates and cleans the unlabeled logical active-room metric', async () => {
		const baseline = await activeRoomMetric();
		const { physical, session } = createSession();

		session.start();
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		assert.strictEqual( await activeRoomMetric(), baseline + 2 );

		physical.close( 1006 );
		assert.strictEqual( await activeRoomMetric(), baseline );
	} );
} );
