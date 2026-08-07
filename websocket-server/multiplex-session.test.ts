import { docs, setPersistence } from '@y/websocket-server/utils';
import jwt from 'jsonwebtoken';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { afterEach, describe, it } from 'node:test';
import { register } from 'prom-client';
import { WebSocket } from 'ws';

import { MultiplexSession } from './multiplex-session';
import { NoopPersistenceProvider } from './noop-persistence-provider';
import { decodeMessage, encodeMessage, type ProtocolMessage } from './protocol';
import { RoomWebSocket } from './room-websocket';

import type { SyncTokenPayload } from './auth';
import type { IncomingMessage } from 'node:http';
import type { Data } from 'ws';

const JWT_SECRET = 'multiplex-test-secret';
const physicalSockets = new Set< RecordingPhysicalSocket >();
type DataMessage = Extract< ProtocolMessage, { type: 'data' } >;

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
	public nextPingThrow: Error | undefined;
	public nextSendThrow: Error | undefined;
	public deferSendCallbacks = false;
	public onSend: ( () => void ) | undefined;
	public onTerminate: ( () => void ) | undefined;
	private readonly pendingSendCallbacks: Array< () => void > = [];

	public send(
		data: Data | Uint8Array,
		_options?: { binary?: boolean },
		callback?: ( error?: Error ) => void
	): void {
		this.onSend?.();
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
		if ( this.nextPingThrow ) {
			throw this.nextPingThrow;
		}
	}

	public terminate(): void {
		this.onTerminate?.();
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

function createSession( initialPayload: SyncTokenPayload = tokenPayload() ): {
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
		JWT_SECRET
	);
	return { physical, session };
}

function subscribeBootstrapRoom(
	physical: RecordingPhysicalSocket,
	initialPayload: SyncTokenPayload = tokenPayload()
): void {
	physical.receive( {
		type: 'subscribe',
		room: initialPayload.room_name,
		grant: grant( initialPayload ),
	} );
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
	const roomSocket: unknown = document.conns.keys().next().value;
	assert.ok( roomSocket instanceof RoomWebSocket );
	return roomSocket;
}

async function activeRoomConnectionMetric(): Promise< number > {
	const metric = await register.getSingleMetricAsString( 'wpvip_rtc_active_room_connections' );
	const match = metric.match( /^wpvip_rtc_active_room_connections (\d+)$/m );
	assert.ok( match );
	return Number( match[ 1 ] );
}

async function roomConnectionCloseMetric( reason: string ): Promise< number > {
	const metric = await register.getSingleMetricAsString(
		'wpvip_rtc_room_connections_closed_total'
	);
	const match = metric.match(
		new RegExp( `^wpvip_rtc_room_connections_closed_total\\{reason="${ reason }"\\} (\\d+)$`, 'm' )
	);
	return match ? Number( match[ 1 ] ) : 0;
}

async function roomConnectionCloseTotalMetric(): Promise< number > {
	const metric = await register.getSingleMetricAsString(
		'wpvip_rtc_room_connections_closed_total'
	);
	return Array.from(
		metric.matchAll( /^wpvip_rtc_room_connections_closed_total\{reason="[^"]+"\} (\d+)$/gm )
	).reduce( ( total, match ) => total + Number( match[ 1 ] ), 0 );
}

async function peakRoomsPerConnectionMetric(): Promise< { count: number; sum: number } > {
	const metric = await register.getSingleMetricAsString( 'wpvip_rtc_peak_rooms_per_connection' );
	const count = metric.match( /^wpvip_rtc_peak_rooms_per_connection_count (\d+)$/m );
	const sum = metric.match( /^wpvip_rtc_peak_rooms_per_connection_sum (\d+)$/m );
	assert.ok( count );
	assert.ok( sum );
	return { count: Number( count[ 1 ] ), sum: Number( sum[ 1 ] ) };
}

async function zeroRoomTimeoutMetric(): Promise< number > {
	const metric = await register.getSingleMetricAsString( 'wpvip_rtc_connection_failures_total' );
	const match = metric.match(
		/^wpvip_rtc_connection_failures_total\{reason="zero_room_timeout"\} (\d+)$/m
	);
	return match ? Number( match[ 1 ] ) : 0;
}

describe( 'MultiplexSession', () => {
	it( 'closes an empty physical socket on the first heartbeat tick', async t => {
		t.mock.timers.enable( { apis: [ 'setInterval' ] } );
		const { physical, session } = createSession();
		const baseline = await zeroRoomTimeoutMetric();
		const roomCloseBaseline = await roomConnectionCloseMetric( 'physical_connection_close' );
		try {
			physical.delayCloseEvent = true;
			session.start();

			t.mock.timers.tick( 30_000 );

			assert.strictEqual( physical.closeCode, 4001 );
			assert.strictEqual( physical.readyState, WebSocket.CLOSING );
			assert.strictEqual( await zeroRoomTimeoutMetric(), baseline + 1 );
			assert.strictEqual(
				await roomConnectionCloseMetric( 'physical_connection_close' ),
				roomCloseBaseline
			);
			assert.strictEqual( physical.pingCalls, 0 );
			assert.strictEqual( physical.terminateCalls, 0 );
		} finally {
			physical.delayCloseEvent = false;
			physical.close();
			t.mock.timers.reset();
		}
	} );

	it( 'uses one responsive physical heartbeat while rooms are active', t => {
		t.mock.timers.enable( { apis: [ 'setInterval' ] } );
		const { physical, session } = createSession();
		try {
			session.start();
			subscribeBootstrapRoom( physical );
			t.mock.timers.tick( 30_000 );
			physical.emit( 'pong', Buffer.alloc( 0 ) );

			t.mock.timers.tick( 30_000 );
			physical.emit( 'pong', Buffer.alloc( 0 ) );

			assert.strictEqual( physical.pingCalls, 2 );
			assert.strictEqual( physical.readyState, WebSocket.OPEN );
		} finally {
			physical.close();
			t.mock.timers.reset();
		}
	} );

	it( 'cleans active rooms before terminating after a missed pong', async t => {
		t.mock.timers.enable( { apis: [ 'setInterval' ] } );
		const { physical, session } = createSession();
		const baseline = await activeRoomConnectionMetric();
		let roomsActiveWhenTerminated: boolean | undefined;
		let roomMetricWhenTerminated: Promise< number > | undefined;
		try {
			session.start();
			subscribeBootstrapRoom( physical );
			physical.receive( {
				type: 'subscribe',
				room: 'site-7/post-2',
				grant: grant( { room_name: 'site-7/post-2' } ),
			} );
			physical.delayCloseEvent = true;
			physical.onTerminate = () => {
				roomsActiveWhenTerminated = docs.has( 'site-7/post-1' ) || docs.has( 'site-7/post-2' );
				roomMetricWhenTerminated = activeRoomConnectionMetric();
			};

			t.mock.timers.tick( 60_000 );

			assert.strictEqual( roomsActiveWhenTerminated, false );
			assert.ok( roomMetricWhenTerminated );
			assert.strictEqual( await roomMetricWhenTerminated, baseline );
			assert.strictEqual( physical.terminateCalls, 1 );
			assert.strictEqual( physical.readyState, WebSocket.CLOSING );
		} finally {
			physical.delayCloseEvent = false;
			physical.close();
			t.mock.timers.reset();
		}
	} );

	it( 'stops the physical heartbeat when the socket closes', t => {
		t.mock.timers.enable( { apis: [ 'setInterval' ] } );
		const { physical, session } = createSession();
		try {
			session.start();
			assert.strictEqual( physical.listenerCount( 'pong' ), 1 );
			physical.close();
			assert.strictEqual( physical.listenerCount( 'pong' ), 0 );

			t.mock.timers.tick( 30_000 );

			assert.strictEqual( physical.pingCalls, 0 );
		} finally {
			t.mock.timers.reset();
		}
	} );

	it( 'cleans the active room before terminating when ping throws', t => {
		t.mock.timers.enable( { apis: [ 'setInterval' ] } );
		const { physical, session } = createSession();
		let roomActiveWhenTerminated: boolean | undefined;
		try {
			physical.nextPingThrow = new Error( 'ping failed' );
			session.start();
			subscribeBootstrapRoom( physical );
			physical.delayCloseEvent = true;
			physical.onTerminate = () => {
				roomActiveWhenTerminated = docs.has( 'site-7/post-1' );
			};

			t.mock.timers.tick( 30_000 );

			assert.strictEqual( roomActiveWhenTerminated, false );
			assert.strictEqual( physical.pingCalls, 1 );
			assert.strictEqual( physical.terminateCalls, 1 );
			assert.strictEqual( physical.readyState, WebSocket.CLOSING );
		} finally {
			physical.delayCloseEvent = false;
			physical.close();
			t.mock.timers.reset();
		}
	} );

	it( 'owns no room until the bootstrap grant is explicitly subscribed', async () => {
		const { physical, session } = createSession();
		const baseline = await activeRoomConnectionMetric();

		session.start();
		assert.deepStrictEqual( decoded( physical ), [] );
		assert.strictEqual( docs.has( 'site-7/post-1' ), false );
		assert.strictEqual( await activeRoomConnectionMetric(), baseline );

		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-1',
			grant: grant(),
		} );

		const messages = decoded( physical );
		assert.deepStrictEqual( messages[ 0 ], { type: 'subscribed', room: 'site-7/post-1' } );
		assertDataMessage( messages[ 1 ] );
		assert.strictEqual( messages[ 1 ].room, 'site-7/post-1' );
		physical.close();
	} );

	it( 'preserves bootstrap wire ordering before a deferred subscribed callback error closes the session', () => {
		const room = 'site-7/deferred-initial-control';
		const { physical, session } = createSession( tokenPayload( { room_name: room } ) );
		physical.deferSendCallbacks = true;
		physical.nextCallbackError = new Error( 'deferred subscribed send failure' );

		session.start();
		subscribeBootstrapRoom( physical, tokenPayload( { room_name: room } ) );

		const messagesBeforeFlush = decoded( physical );
		assert.deepStrictEqual( messagesBeforeFlush[ 0 ], { type: 'subscribed', room } );
		assertDataMessage( messagesBeforeFlush[ 1 ] );
		assert.strictEqual( messagesBeforeFlush[ 1 ].room, room );
		physical.flushSendCallbacks();

		assert.strictEqual( physical.closeCode, 1011 );
		assert.strictEqual( docs.has( room ), false );
	} );

	it( 'does not set up Yjs when the subscribed acknowledgement throws synchronously', () => {
		const room = 'site-7/synchronous-ack-failure';
		const { physical, session } = createSession( tokenPayload( { room_name: room } ) );
		let roomActiveWhenAcknowledged: boolean | undefined;
		physical.onSend = () => {
			roomActiveWhenAcknowledged = docs.has( room );
		};
		physical.nextSendThrow = new Error( 'subscribed send failed' );

		session.start();
		subscribeBootstrapRoom( physical, tokenPayload( { room_name: room } ) );

		assert.strictEqual( roomActiveWhenAcknowledged, false );
		assert.strictEqual( docs.has( room ), false );
		assert.strictEqual( physical.closeCode, 1011 );
	} );

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
		subscribeBootstrapRoom( physical );
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
			subscribeBootstrapRoom( physical );
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
			subscribeBootstrapRoom( physical );
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

	it( 'rejects an expired later grant with an invalid payload as terminal', () => {
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
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
			const baseline = await activeRoomConnectionMetric();
			const { physical, session } = createSession();
			session.start();
			subscribeBootstrapRoom( physical );
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
				roomMetric: await activeRoomConnectionMetric(),
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

	it( 'keeps the physical connection open after multiple expired room grants', async () => {
		const { physical, session } = createSession();
		const baseline = await roomConnectionCloseMetric( 'grant_expired' );
		session.start();
		subscribeBootstrapRoom( physical );
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
		assert.strictEqual( await roomConnectionCloseMetric( 'grant_expired' ), baseline + 2 );
		physical.close();
	} );

	it( 'closes the physical connection after repeated valid-grant identity mismatches', () => {
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
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
		subscribeBootstrapRoom( physical );
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

	it( 'acknowledges a duplicate subscription without replacing its active room', async () => {
		const baseline = await activeRoomConnectionMetric();
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		const originalRoomSocket = activeRoomSocket( 'site-7/post-2' );
		physical.sent.splice( 0 );
		const roomCloseBaseline = await roomConnectionCloseTotalMetric();

		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: 'not-a-grant',
		} );
		await Promise.resolve();

		const actual = {
			closeCode: physical.closeCode,
			messages: decoded( physical ),
			postOneConnections: docs.get( 'site-7/post-1' )?.conns.size,
			postTwoConnections: docs.get( 'site-7/post-2' )?.conns.size,
			postTwoSocket: activeRoomSocket( 'site-7/post-2' ),
			readyState: physical.readyState,
			roomCloseMetric: await roomConnectionCloseTotalMetric(),
			roomMetric: await activeRoomConnectionMetric(),
		};
		physical.close();

		assert.deepStrictEqual( actual.messages, [ { type: 'subscribed', room: 'site-7/post-2' } ] );
		assert.strictEqual( actual.closeCode, undefined );
		assert.strictEqual( actual.readyState, WebSocket.OPEN );
		assert.strictEqual( actual.postOneConnections, 1 );
		assert.strictEqual( actual.postTwoConnections, 1 );
		assert.strictEqual( actual.postTwoSocket, originalRoomSocket );
		assert.strictEqual( actual.roomCloseMetric, roomCloseBaseline );
		assert.strictEqual( actual.roomMetric, baseline + 2 );
	} );

	it( 'closes an unsubscribed room through the normal adapter cleanup path', async () => {
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		const roomCloseBaseline = await roomConnectionCloseMetric( 'client_unsubscribe' );

		physical.receive( { type: 'unsubscribe', room: 'site-7/post-2' } );
		await Promise.resolve();
		physical.receive( { type: 'unsubscribe', room: 'site-7/post-2' } );

		assert.strictEqual( docs.has( 'site-7/post-2' ), false );
		assert.strictEqual( docs.get( 'site-7/post-1' )?.conns.size, 1 );
		assert.strictEqual(
			await roomConnectionCloseMetric( 'client_unsubscribe' ),
			roomCloseBaseline + 1
		);
		physical.close();
	} );

	it( 'keeps unknown unsubscribe idempotent without creating a closed-room marker', () => {
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
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

	it( 'rejects unauthorized room data and closes repeated bypass attempts', async () => {
		const { physical, session } = createSession();
		session.start();
		physical.sent.splice( 0 );
		const roomCloseBaseline = await roomConnectionCloseMetric( 'authorization_rejected' );

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
		assert.strictEqual(
			await roomConnectionCloseMetric( 'authorization_rejected' ),
			roomCloseBaseline + 2
		);
	} );

	it( 'drops late data for an authorized closed room without consuming bypass budget', async () => {
		const { physical, session } = createSession();
		session.start();
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		physical.receive( { type: 'unsubscribe', room: 'site-7/post-2' } );
		physical.sent.splice( 0 );
		const roomCloseBaseline = await roomConnectionCloseMetric( 'authorization_rejected' );

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
		assert.strictEqual(
			await roomConnectionCloseMetric( 'authorization_rejected' ),
			roomCloseBaseline + 1
		);
		physical.close();
	} );

	it( 'ignores buffered messages after an externally initiated close starts', async () => {
		const baseline = await activeRoomConnectionMetric();
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
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
		assert.strictEqual( await activeRoomConnectionMetric(), baseline );
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

	it( 'reports a server room close as retryable without harming another room', async () => {
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		physical.sent.splice( 0 );
		const roomCloseBaseline = await roomConnectionCloseMetric( 'server_room_close' );

		activeRoomSocket( 'site-7/post-2' ).close();

		assert.deepStrictEqual( decoded( physical ), [
			{ type: 'room_closed', room: 'site-7/post-2', code: 4005 },
		] );
		assert.strictEqual( physical.readyState, WebSocket.OPEN );
		assert.strictEqual( docs.has( 'site-7/post-2' ), false );
		assert.strictEqual( docs.get( 'site-7/post-1' )?.conns.size, 1 );
		assert.strictEqual(
			await roomConnectionCloseMetric( 'server_room_close' ),
			roomCloseBaseline + 1
		);
		physical.close();
	} );

	it( 'cleans every room immediately after a synchronous physical send failure', () => {
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		physical.delayCloseEvent = true;
		physical.nextSendThrow = new Error( 'physical send failed' );

		assert.doesNotThrow( () =>
			activeRoomSocket( 'site-7/post-2' ).send( Uint8Array.from( [ 0 ] ) )
		);

		assert.strictEqual( physical.closeCode, 1011 );
		assert.strictEqual( physical.readyState, WebSocket.CLOSING );
		assert.strictEqual( docs.has( 'site-7/post-1' ), false );
		assert.strictEqual( docs.has( 'site-7/post-2' ), false );
	} );

	it( 'rethrows a synchronous send-callback exception after cleaning every room', () => {
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		physical.delayCloseEvent = true;
		const sendFailure = new Error( 'physical send failed' );
		const callbackFailure = new Error( 'send callback failed' );
		physical.nextCallbackError = sendFailure;
		let roomsActiveInCallback: boolean | undefined;

		assert.throws(
			() =>
				activeRoomSocket( 'site-7/post-2' ).send( Uint8Array.from( [ 0 ] ), error => {
					assert.strictEqual( error, sendFailure );
					roomsActiveInCallback = docs.has( 'site-7/post-1' ) || docs.has( 'site-7/post-2' );
					throw callbackFailure;
				} ),
			error => error === callbackFailure
		);

		assert.strictEqual( roomsActiveInCallback, false );
		assert.strictEqual( physical.closeCode, 1011 );
		assert.strictEqual( docs.has( 'site-7/post-1' ), false );
		assert.strictEqual( docs.has( 'site-7/post-2' ), false );
	} );

	it( 'cleans every room before a deferred y-websocket send callback observes failure', () => {
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		physical.flushSendCallbacks();
		physical.deferSendCallbacks = true;
		physical.nextCallbackError = new Error( 'physical send failed' );
		physical.delayCloseEvent = true;
		let roomsActiveInCallback: boolean | undefined;

		activeRoomSocket( 'site-7/post-2' ).send( Uint8Array.from( [ 0 ] ), () => {
			roomsActiveInCallback = docs.has( 'site-7/post-1' ) || docs.has( 'site-7/post-2' );
		} );
		assert.strictEqual( docs.has( 'site-7/post-1' ), true );
		physical.flushSendCallbacks();

		assert.strictEqual( roomsActiveInCallback, false );
		assert.strictEqual( physical.closeCode, 1011 );
		assert.strictEqual( docs.has( 'site-7/post-1' ), false );
		assert.strictEqual( docs.has( 'site-7/post-2' ), false );
	} );

	it( 'closes malformed physical framing', () => {
		const { physical, session } = createSession();
		session.start();

		physical.emit( 'message', Buffer.from( [ 0xff ] ), true );

		assert.strictEqual( physical.closeCode, 1002 );
	} );

	it( 'cleans every room after non-binary framing without waiting for close', () => {
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		physical.delayCloseEvent = true;

		physical.emit( 'message', Buffer.from( [ 0xff ] ), false );

		assert.strictEqual( physical.closeCode, 1002 );
		assert.strictEqual( docs.has( 'site-7/post-1' ), false );
		assert.strictEqual( docs.has( 'site-7/post-2' ), false );
	} );

	it( 'cleans rooms after a send failure while the physical socket is closing', async () => {
		const baseline = await activeRoomConnectionMetric();
		const roomCloseBaseline = await roomConnectionCloseMetric( 'physical_connection_close' );
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		assert.strictEqual( docs.get( 'site-7/post-1' )?.conns.size, 1 );
		assert.strictEqual( docs.get( 'site-7/post-2' )?.conns.size, 1 );
		assert.strictEqual( await activeRoomConnectionMetric(), baseline + 2 );
		physical.delayCloseEvent = true;
		physical.close( 1008 );
		physical.nextCallbackError = new Error( 'send failure while closing' );

		activeRoomSocket( 'site-7/post-2' ).send( Uint8Array.from( [ 0 ] ) );

		const actual = {
			closeCode: physical.closeCode,
			postOneActive: docs.has( 'site-7/post-1' ),
			postTwoActive: docs.has( 'site-7/post-2' ),
			readyState: physical.readyState,
			roomMetric: await activeRoomConnectionMetric(),
		};
		physical.delayCloseEvent = false;
		physical.close( 1008 );

		assert.strictEqual( actual.closeCode, 1008 );
		assert.strictEqual( actual.readyState, WebSocket.CLOSING );
		assert.strictEqual( actual.postOneActive, false );
		assert.strictEqual( actual.postTwoActive, false );
		assert.strictEqual( actual.roomMetric, baseline );
		assert.strictEqual(
			await roomConnectionCloseMetric( 'physical_connection_close' ),
			roomCloseBaseline + 2
		);
	} );

	it( 'cleans every room after the physical socket closes', async () => {
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );

		physical.close( 1006 );
		await Promise.resolve();

		assert.strictEqual( docs.has( 'site-7/post-1' ), false );
		assert.strictEqual( docs.has( 'site-7/post-2' ), false );
	} );

	it( 'updates and cleans the active-room-connection metric', async () => {
		const baseline = await activeRoomConnectionMetric();
		const { physical, session } = createSession();

		session.start();
		subscribeBootstrapRoom( physical );
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		assert.strictEqual( await activeRoomConnectionMetric(), baseline + 2 );

		physical.close( 1006 );
		assert.strictEqual( await activeRoomConnectionMetric(), baseline );
	} );

	it( 'records one peak from accepted rooms when the physical connection closes', async () => {
		const baseline = await peakRoomsPerConnectionMetric();
		const { physical, session } = createSession();
		session.start();
		subscribeBootstrapRoom( physical );
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );

		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-2',
			grant: grant( { room_name: 'site-7/post-2' } ),
		} );
		physical.receive( {
			type: 'subscribe',
			room: 'site-7/post-3',
			grant: grant( { room_name: 'site-7/post-3' }, 'wrong-secret' ),
		} );
		physical.close();

		assert.deepStrictEqual( await peakRoomsPerConnectionMetric(), {
			count: baseline.count + 1,
			sum: baseline.sum + 2,
		} );
	} );
} );
