import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import {
	MAX_GRANT_BYTES,
	MAX_ROOM_NAME_BYTES,
	decodeMessage,
	encodeMessage,
} from '../../websocket-server/protocol';
import { createSharedWebSocketAdapter } from '../shared-websocket';
import { MULTIPLEX_PROTOCOL_FAILURE_CLOSE_CODE } from '../websocket-close-policy';

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
	public throwOnNextSend = false;
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
		if ( this.throwOnNextSend ) {
			this.throwOnNextSend = false;
			throw new Error( 'physical send failed' );
		}
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

	public close( code?: number ): void {
		if ( code !== undefined && code !== 1000 && ( code < 3000 || code > 4999 ) ) {
			throw new DOMException( 'Invalid WebSocket close code', 'InvalidAccessError' );
		}
		this.readyState = FakePhysicalWebSocket.CLOSING;
		this.emitClose( code ?? 1000 );
	}

	public emitOpen(): void {
		this.readyState = FakePhysicalWebSocket.OPEN;
		this.onopen?.( new Event( 'open' ) );
	}

	public emitClose( code: number ): void {
		if ( this.readyState === FakePhysicalWebSocket.CLOSED ) {
			return;
		}
		this.readyState = FakePhysicalWebSocket.CLOSED;
		this.onclose?.( Object.assign( new Event( 'close' ), { code } ) );
	}

	public emitMessage( message: Uint8Array ): void {
		const data = message.buffer.slice(
			message.byteOffset,
			message.byteOffset + message.byteLength
		) as ArrayBuffer;
		this.onmessage?.( new MessageEvent( 'message', { data } ) );
	}

	public emitError( event: Event ): void {
		this.onerror?.( event );
	}
}

describe( 'createSharedWebSocketAdapter', () => {
	beforeEach( () => {
		FakePhysicalWebSocket.instances = [];
	} );

	it( 'normalizes room URLs into one neutral multiplex socket and rejects lookalike bases', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws/',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const virtual = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);

		assert.strictEqual( SharedWebSocket.CONNECTING, 0 );
		assert.strictEqual( SharedWebSocket.OPEN, 1 );
		assert.strictEqual( SharedWebSocket.CLOSING, 2 );
		assert.strictEqual( SharedWebSocket.CLOSED, 3 );
		assert.strictEqual( virtual.CONNECTING, 0 );
		assert.strictEqual( virtual.OPEN, 1 );
		assert.strictEqual( virtual.CLOSING, 2 );
		assert.strictEqual( virtual.CLOSED, 3 );
		assert.strictEqual( virtual.readyState, SharedWebSocket.CONNECTING );

		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		assert.strictEqual( physical.url, 'wss://example.test/_ws?auth=grant-1' );
		assert.strictEqual( physical.protocols, 'vip-rtc-multiplex-v1' );
		assert.strictEqual( physical.binaryType, 'arraybuffer' );

		physical.emitOpen();
		assert.strictEqual( virtual.readyState, SharedWebSocket.CONNECTING );
		assert.deepStrictEqual( physical.sent.map( decodeMessage ), [
			{
				type: 'subscribe',
				room: 'site-7/postType/page-123',
				grant: 'grant-1',
			},
		] );

		assert.throws(
			() => new SharedWebSocket( 'wss://example.test/_ws-other/room?auth=grant-1' ),
			/normalized server URL/
		);
		assert.strictEqual( FakePhysicalWebSocket.instances.length, 1 );
	} );

	it( 'rejects missing or empty rooms and auth grants', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws/',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);

		assert.throws(
			() => new SharedWebSocket( 'wss://example.test/_ws/room' ),
			/non-empty auth grant/
		);
		assert.throws(
			() => new SharedWebSocket( 'wss://example.test/_ws/room?auth=' ),
			/non-empty auth grant/
		);
		assert.throws(
			() => new SharedWebSocket( 'wss://example.test/_ws/?auth=grant-1' ),
			/non-empty room/
		);
		assert.strictEqual( FakePhysicalWebSocket.instances.length, 0 );
	} );

	it( 'rejects rooms and grants that cannot be subscribe-framed before registration', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws/',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);

		assert.throws(
			() =>
				new SharedWebSocket(
					`wss://example.test/_ws/${ 'r'.repeat( MAX_ROOM_NAME_BYTES + 1 ) }?auth=grant-1`
				),
			/exceeds limit/
		);
		assert.throws(
			() =>
				new SharedWebSocket(
					`wss://example.test/_ws/room?auth=${ 'g'.repeat( MAX_GRANT_BYTES + 1 ) }`
				),
			/exceeds limit/
		);
		assert.strictEqual( FakePhysicalWebSocket.instances.length, 0 );
	} );

	it( 'rejects duplicate live room registrations while connecting or open', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const original = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();

		assert.throws(
			() => new SharedWebSocket( 'wss://example.test/_ws/site-7/postType/page-123?auth=grant-2' ),
			/already registered/
		);

		physical.emitMessage(
			encodeMessage( { type: 'subscribed', room: 'site-7/postType/page-123' } )
		);
		assert.strictEqual( original.readyState, SharedWebSocket.OPEN );
		assert.throws(
			() => new SharedWebSocket( 'wss://example.test/_ws/site-7/postType/page-123?auth=grant-3' ),
			/already registered/
		);
		assert.strictEqual( FakePhysicalWebSocket.instances.length, 1 );

		original.close();
		assert.strictEqual( physical.readyState, FakePhysicalWebSocket.CLOSED );
	} );

	it( 'rolls back a bootstrap room when physical construction throws', () => {
		class FlakyPhysicalWebSocket extends FakePhysicalWebSocket {
			public static failConstruction = true;

			public constructor( url: string | URL, protocols?: string | string[] ) {
				if ( FlakyPhysicalWebSocket.failConstruction ) {
					FlakyPhysicalWebSocket.failConstruction = false;
					throw new Error( 'physical construction failed' );
				}
				super( url, protocols );
			}
		}

		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FlakyPhysicalWebSocket as unknown as typeof WebSocket
		);

		assert.throws(
			() => new SharedWebSocket( 'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1' ),
			/physical construction failed/
		);

		const retried = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-2'
		);
		assert.strictEqual( retried.readyState, SharedWebSocket.CONNECTING );
		assert.strictEqual( FakePhysicalWebSocket.instances.length, 1 );
	} );

	it( 'rolls back a room when immediate subscribe send throws', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const initial = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		physical.throwOnNextSend = true;

		assert.throws(
			() => new SharedWebSocket( 'wss://example.test/_ws/site-7/postType/post-456?auth=grant-2' ),
			/physical send failed/
		);
		assert.strictEqual( initial.readyState, SharedWebSocket.CONNECTING );
		assert.strictEqual( physical.readyState, FakePhysicalWebSocket.OPEN );

		const retried = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-456?auth=grant-3'
		);
		assert.strictEqual( retried.readyState, SharedWebSocket.CONNECTING );
		assert.deepStrictEqual( decodeMessage( physical.sent[ 1 ] ?? new Uint8Array() ), {
			type: 'subscribe',
			room: 'site-7/postType/post-456',
			grant: 'grant-3',
		} );
	} );

	it( 'acknowledges each room before opening or carrying its data', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const initial = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const later = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-456?auth=grant-2'
		);
		const initialPayload = new Uint8Array( [ 0, 7, 8, 0 ] ).subarray( 1, 3 );
		const laterPayload = new Uint8Array( [ 9, 10 ] );
		const initialReceivedPayloads: Uint8Array[] = [];
		const laterReceivedPayloads: Uint8Array[] = [];
		let initialOpenCount = 0;
		let laterOpenCount = 0;

		initial.onmessage = event =>
			initialReceivedPayloads.push( new Uint8Array( event.data as ArrayBuffer ) );
		later.onmessage = event =>
			laterReceivedPayloads.push( new Uint8Array( event.data as ArrayBuffer ) );
		initial.onopen = () => {
			initialOpenCount += 1;
			initial.send( initialPayload );
		};
		later.onopen = () => {
			laterOpenCount += 1;
			later.send( laterPayload );
		};

		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		assert.deepStrictEqual( physical.sent, [] );

		physical.emitOpen();
		assert.throws( () => initial.send( new Uint8Array( [ 7 ] ) ), { name: 'InvalidStateError' } );
		for ( const [ room, payload ] of [
			[ 'site-7/postType/page-123', new Uint8Array( [ 1 ] ) ],
			[ 'site-7/postType/post-456', new Uint8Array( [ 2 ] ) ],
		] as const ) {
			physical.emitMessage( encodeMessage( { type: 'data', room, payload } ) );
		}

		assert.strictEqual( initial.readyState, SharedWebSocket.CONNECTING );
		assert.strictEqual( later.readyState, SharedWebSocket.CONNECTING );
		assert.deepStrictEqual( initialReceivedPayloads, [] );
		assert.deepStrictEqual( laterReceivedPayloads, [] );
		assert.deepStrictEqual( physical.sent.map( decodeMessage ), [
			{
				type: 'subscribe',
				room: 'site-7/postType/page-123',
				grant: 'grant-1',
			},
			{
				type: 'subscribe',
				room: 'site-7/postType/post-456',
				grant: 'grant-2',
			},
		] );

		physical.emitMessage(
			encodeMessage( { type: 'subscribed', room: 'site-7/postType/page-123' } )
		);
		assert.strictEqual( initial.readyState, SharedWebSocket.OPEN );
		assert.strictEqual( initialOpenCount, 1 );
		assert.strictEqual( later.readyState, SharedWebSocket.CONNECTING );
		assert.strictEqual( laterOpenCount, 0 );
		assert.deepStrictEqual( decodeMessage( physical.sent[ 2 ] ?? new Uint8Array() ), {
			type: 'data',
			room: 'site-7/postType/page-123',
			payload: initialPayload,
		} );

		physical.emitMessage(
			encodeMessage( { type: 'subscribed', room: 'site-7/postType/post-456' } )
		);
		assert.strictEqual( later.readyState, SharedWebSocket.OPEN );
		assert.strictEqual( laterOpenCount, 1 );
		assert.deepStrictEqual( decodeMessage( physical.sent[ 3 ] ?? new Uint8Array() ), {
			type: 'data',
			room: 'site-7/postType/post-456',
			payload: laterPayload,
		} );
		assert.deepStrictEqual( initialReceivedPayloads, [] );
		assert.deepStrictEqual( laterReceivedPayloads, [] );
	} );

	it( 'closes and fans out when a queued subscribe send throws', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const first = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const second = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-456?auth=grant-2'
		);
		const third = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-789?auth=grant-3'
		);
		const closeEvents: CloseEvent[] = [];
		for ( const virtual of [ first, second, third ] ) {
			virtual.onclose = event => closeEvents.push( event );
		}

		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.throwOnNextSend = true;

		assert.doesNotThrow( () => physical.emitOpen() );
		assert.strictEqual( physical.readyState, FakePhysicalWebSocket.CLOSED );
		assert.strictEqual( first.readyState, SharedWebSocket.CLOSED );
		assert.strictEqual( second.readyState, SharedWebSocket.CLOSED );
		assert.strictEqual( third.readyState, SharedWebSocket.CLOSED );
		assert.deepStrictEqual( physical.sent, [] );
		assert.deepStrictEqual(
			closeEvents.map( event => event.code ),
			[ 1000, 1000, 1000 ]
		);
	} );

	it( 'closes the physical socket when a virtual data send throws', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const virtual = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		virtual.onopen = () => virtual.send( new Uint8Array( [ 1 ] ) );

		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		physical.throwOnNextSend = true;

		assert.throws(
			() =>
				physical.emitMessage(
					encodeMessage( { type: 'subscribed', room: 'site-7/postType/page-123' } )
				),
			/physical send failed/
		);
		assert.strictEqual( physical.readyState, FakePhysicalWebSocket.CLOSED );
		assert.strictEqual( virtual.readyState, SharedWebSocket.CLOSED );
	} );

	it( 'routes registered-room data with exact ArrayBuffer bounds and drops unknown rooms', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const initial = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const later = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-456?auth=grant-2'
		);
		const initialMessages: Uint8Array[] = [];
		const laterMessages: Uint8Array[] = [];

		initial.onmessage = event => {
			initialMessages.push( new Uint8Array( event.data as ArrayBuffer ) );
		};
		later.onmessage = event => {
			const data = event.data as ArrayBuffer;
			assert.strictEqual( data.byteLength, 3 );
			laterMessages.push( new Uint8Array( data ) );
		};

		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		physical.emitMessage(
			encodeMessage( { type: 'subscribed', room: 'site-7/postType/page-123' } )
		);
		physical.emitMessage(
			encodeMessage( { type: 'subscribed', room: 'site-7/postType/post-456' } )
		);
		physical.emitMessage(
			encodeMessage( {
				type: 'data',
				room: 'site-7/postType/missing',
				payload: new Uint8Array( [ 1 ] ),
			} )
		);
		physical.emitMessage(
			encodeMessage( {
				type: 'data',
				room: 'site-7/postType/post-456',
				payload: new Uint8Array( [ 3, 4, 5 ] ),
			} )
		);

		assert.deepStrictEqual( initialMessages, [] );
		assert.deepStrictEqual( laterMessages, [ new Uint8Array( [ 3, 4, 5 ] ) ] );
		assert.strictEqual( initial.readyState, SharedWebSocket.OPEN );
		assert.strictEqual( physical.readyState, FakePhysicalWebSocket.OPEN );
	} );

	it( 'unsubscribes rooms, isolates local closes, and shuts down after a throwing final callback', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const initial = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const later = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-456?auth=grant-2'
		);
		let initialCloseCount = 0;
		initial.onclose = () => {
			initialCloseCount += 1;
			// Mirrors y-websocket's reentrant close from its onclose handler.
			initial.close();
		};
		later.onclose = () => {
			throw new Error( 'virtual close callback failed' );
		};

		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		physical.emitMessage(
			encodeMessage( { type: 'subscribed', room: 'site-7/postType/page-123' } )
		);
		physical.emitMessage(
			encodeMessage( { type: 'subscribed', room: 'site-7/postType/post-456' } )
		);

		initial.close();

		assert.strictEqual( initial.readyState, SharedWebSocket.CLOSED );
		assert.strictEqual( initialCloseCount, 1 );
		assert.strictEqual( later.readyState, SharedWebSocket.OPEN );
		assert.strictEqual( physical.readyState, FakePhysicalWebSocket.OPEN );
		assert.deepStrictEqual(
			decodeMessage( physical.sent[ physical.sent.length - 1 ] ?? new Uint8Array() ),
			{
				type: 'unsubscribe',
				room: 'site-7/postType/page-123',
			}
		);

		assert.throws( () => later.close(), /virtual close callback failed/ );

		assert.strictEqual( later.readyState, SharedWebSocket.CLOSED );
		assert.strictEqual( physical.readyState, FakePhysicalWebSocket.CLOSED );
		assert.deepStrictEqual(
			decodeMessage( physical.sent[ physical.sent.length - 1 ] ?? new Uint8Array() ),
			{
				type: 'unsubscribe',
				room: 'site-7/postType/post-456',
			}
		);
	} );

	it( 'finishes virtual close and fans out when unsubscribe send throws', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const first = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const second = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-456?auth=grant-2'
		);
		let firstCloseCount = 0;
		const secondCloseEvents: CloseEvent[] = [];
		first.onclose = () => {
			firstCloseCount += 1;
		};
		second.onclose = event => secondCloseEvents.push( event );

		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		physical.emitMessage(
			encodeMessage( { type: 'subscribed', room: 'site-7/postType/page-123' } )
		);
		physical.emitMessage(
			encodeMessage( { type: 'subscribed', room: 'site-7/postType/post-456' } )
		);
		physical.throwOnNextSend = true;

		assert.doesNotThrow( () => first.close() );
		assert.strictEqual( first.readyState, SharedWebSocket.CLOSED );
		assert.strictEqual( firstCloseCount, 1 );
		assert.strictEqual( second.readyState, SharedWebSocket.CLOSED );
		assert.strictEqual( physical.readyState, FakePhysicalWebSocket.CLOSED );
		assert.strictEqual( secondCloseEvents[ 0 ]?.code, 1000 );
	} );

	it( 'isolates room_closed to the named room', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const initial = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const later = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-456?auth=grant-2'
		);
		const closeCodes: number[] = [];
		initial.onclose = event => {
			closeCodes.push( event.code );
		};

		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		physical.emitMessage(
			encodeMessage( { type: 'subscribed', room: 'site-7/postType/page-123' } )
		);
		physical.emitMessage(
			encodeMessage( { type: 'subscribed', room: 'site-7/postType/post-456' } )
		);
		physical.emitMessage(
			encodeMessage( {
				type: 'room_closed',
				room: 'site-7/postType/page-123',
				code: 4004,
			} )
		);

		assert.deepStrictEqual( closeCodes, [ 4004 ] );
		assert.strictEqual( initial.readyState, SharedWebSocket.CLOSED );
		assert.strictEqual( later.readyState, SharedWebSocket.OPEN );
		assert.strictEqual( physical.readyState, FakePhysicalWebSocket.OPEN );
	} );

	it( 'skips a bootstrap provider removed before open and cleans up its raced acknowledgement', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const initial = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const later = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-456?auth=grant-2'
		);
		let initialOpened = false;
		initial.onopen = () => {
			initialOpened = true;
		};

		initial.close();
		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		physical.emitMessage(
			encodeMessage( { type: 'subscribed', room: 'site-7/postType/page-123' } )
		);

		assert.strictEqual( initialOpened, false );
		assert.strictEqual( later.readyState, SharedWebSocket.CONNECTING );
		assert.deepStrictEqual( physical.sent.map( decodeMessage ), [
			{
				type: 'subscribe',
				room: 'site-7/postType/post-456',
				grant: 'grant-2',
			},
			{ type: 'unsubscribe', room: 'site-7/postType/page-123' },
		] );
	} );

	it( 'closes and fans out when orphan acknowledgement cleanup send throws', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const initial = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const later = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-456?auth=grant-2'
		);
		const laterCloseEvents: CloseEvent[] = [];
		later.onclose = event => laterCloseEvents.push( event );

		initial.close();
		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		physical.throwOnNextSend = true;

		assert.doesNotThrow( () =>
			physical.emitMessage(
				encodeMessage( { type: 'subscribed', room: 'site-7/postType/page-123' } )
			)
		);
		assert.strictEqual( initial.readyState, SharedWebSocket.CLOSED );
		assert.strictEqual( later.readyState, SharedWebSocket.CLOSED );
		assert.strictEqual( physical.readyState, FakePhysicalWebSocket.CLOSED );
		assert.strictEqual( laterCloseEvents[ 0 ]?.code, 1000 );
	} );

	it( 'closes the physical socket with private 4006 for undecodable bytes', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const virtual = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const closeCodes: number[] = [];
		virtual.onclose = event => closeCodes.push( event.code );

		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		physical.emitOpen();
		physical.emitMessage( new Uint8Array( [ 0xff ] ) );

		assert.strictEqual( physical.readyState, FakePhysicalWebSocket.CLOSED );
		assert.strictEqual( MULTIPLEX_PROTOCOL_FAILURE_CLOSE_CODE, 4006 );
		assert.deepStrictEqual( closeCodes, [ 4006 ] );
	} );

	it( 'closes the physical socket with private 4006 for client-origin control frames', () => {
		for ( const message of [
			encodeMessage( { type: 'subscribe', room: 'server-room', grant: 'server-grant' } ),
			encodeMessage( { type: 'unsubscribe', room: 'server-room' } ),
		] ) {
			FakePhysicalWebSocket.instances = [];
			const SharedWebSocket = createSharedWebSocketAdapter(
				'wss://example.test/_ws',
				FakePhysicalWebSocket as unknown as typeof WebSocket
			);
			const virtual = new SharedWebSocket(
				'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
			);
			const closeCodes: number[] = [];
			virtual.onclose = event => closeCodes.push( event.code );

			const physical = FakePhysicalWebSocket.instances[ 0 ];
			assert.ok( physical );
			physical.emitOpen();
			physical.emitMessage( message );

			assert.strictEqual( physical.readyState, FakePhysicalWebSocket.CLOSED );
			assert.deepStrictEqual( closeCodes, [ MULTIPLEX_PROTOCOL_FAILURE_CLOSE_CODE ] );
		}
	} );

	it( 'coalesces retries and subscribes every room regardless of the transport-opening grant', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const first = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const second = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-456?auth=grant-2'
		);
		const firstCloseEvents: CloseEvent[] = [];
		const secondCloseEvents: CloseEvent[] = [];
		first.onclose = event => {
			firstCloseEvents.push( event );
			throw new Error( 'first close callback failed' );
		};
		second.onclose = event => secondCloseEvents.push( event );

		const oldPhysical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( oldPhysical );
		oldPhysical.emitOpen();
		assert.doesNotThrow( () => oldPhysical.emitClose( 1011 ) );

		assert.strictEqual( first.readyState, SharedWebSocket.CLOSED );
		assert.strictEqual( second.readyState, SharedWebSocket.CLOSED );
		assert.strictEqual( firstCloseEvents[ 0 ]?.code, 1011 );
		assert.strictEqual( secondCloseEvents[ 0 ], firstCloseEvents[ 0 ] );

		const retriedSecond = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-456?auth=fresh-2'
		);
		const retriedFirst = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=fresh-1'
		);
		assert.strictEqual( FakePhysicalWebSocket.instances.length, 2 );

		const newPhysical = FakePhysicalWebSocket.instances[ 1 ];
		assert.ok( newPhysical );
		newPhysical.emitOpen();

		assert.deepStrictEqual( newPhysical.sent.map( decodeMessage ), [
			{
				type: 'subscribe',
				room: 'site-7/postType/post-456',
				grant: 'fresh-2',
			},
			{
				type: 'subscribe',
				room: 'site-7/postType/page-123',
				grant: 'fresh-1',
			},
		] );
		assert.strictEqual( retriedSecond.readyState, SharedWebSocket.CONNECTING );
		assert.strictEqual( retriedFirst.readyState, SharedWebSocket.CONNECTING );
	} );

	it( 'ignores stale transport callbacks after the physical socket is replaced', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const oldVirtual = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const oldPhysical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( oldPhysical );
		const staleOpen = oldPhysical.onopen;
		const staleClose = oldPhysical.onclose;
		const staleMessage = oldPhysical.onmessage;
		const staleError = oldPhysical.onerror;
		oldPhysical.emitClose( 1011 );
		assert.strictEqual( oldVirtual.readyState, SharedWebSocket.CLOSED );

		const current = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=fresh-1'
		);
		const later = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-456?auth=fresh-2'
		);
		const currentPhysical = FakePhysicalWebSocket.instances[ 1 ];
		assert.ok( currentPhysical );
		const currentErrors: Event[] = [];
		current.onerror = event => currentErrors.push( event );
		currentPhysical.emitOpen();
		const sentAfterCurrentOpen = currentPhysical.sent.map( frame => new Uint8Array( frame ) );
		oldPhysical.readyState = FakePhysicalWebSocket.OPEN;

		staleOpen?.( new Event( 'open' ) );
		staleClose?.( Object.assign( new Event( 'close' ), { code: 4001 } ) );
		const staleData = encodeMessage( {
			type: 'subscribed',
			room: 'site-7/postType/page-123',
		} );
		staleMessage?.(
			new MessageEvent( 'message', {
				data: staleData.buffer.slice(
					staleData.byteOffset,
					staleData.byteOffset + staleData.byteLength
				) as ArrayBuffer,
			} )
		);
		staleError?.( new Event( 'error' ) );

		assert.deepStrictEqual( currentErrors, [] );
		assert.deepStrictEqual( currentPhysical.sent, sentAfterCurrentOpen );
		assert.strictEqual( currentPhysical.readyState, FakePhysicalWebSocket.OPEN );
		assert.strictEqual( current.readyState, SharedWebSocket.CONNECTING );
		assert.strictEqual( later.readyState, SharedWebSocket.CONNECTING );
	} );

	it( 'fans the same physical error event out without closing the transport', () => {
		const SharedWebSocket = createSharedWebSocketAdapter(
			'wss://example.test/_ws',
			FakePhysicalWebSocket as unknown as typeof WebSocket
		);
		const first = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/page-123?auth=grant-1'
		);
		const second = new SharedWebSocket(
			'wss://example.test/_ws/site-7/postType/post-456?auth=grant-2'
		);
		const firstErrors: Event[] = [];
		const secondErrors: Event[] = [];
		first.onerror = event => {
			firstErrors.push( event );
			throw new Error( 'first error callback failed' );
		};
		second.onerror = event => secondErrors.push( event );

		const physical = FakePhysicalWebSocket.instances[ 0 ];
		assert.ok( physical );
		const error = new Event( 'error' );
		assert.doesNotThrow( () => physical.emitError( error ) );

		assert.deepStrictEqual( firstErrors, [ error ] );
		assert.deepStrictEqual( secondErrors, [ error ] );
		assert.strictEqual( firstErrors[ 0 ], secondErrors[ 0 ] );
		assert.strictEqual( physical.readyState, FakePhysicalWebSocket.CONNECTING );
		assert.strictEqual( first.readyState, SharedWebSocket.CONNECTING );
		assert.strictEqual( second.readyState, SharedWebSocket.CONNECTING );
	} );
} );
