import {
	MULTIPLEX_PROTOCOL_FAILURE_CLOSE_CODE,
	markAsRoomCloseEvent,
} from './websocket-close-policy';
import {
	MULTIPLEX_SUBPROTOCOL,
	decodeMessage,
	encodeMessage,
	type ProtocolMessage,
} from '../websocket-server/protocol';

function normalizeServerUrl( serverUrl: string ): string {
	while ( serverUrl.endsWith( '/' ) ) {
		serverUrl = serverUrl.slice( 0, -1 );
	}
	return serverUrl;
}

function parseRoomUrl(
	roomUrl: string | URL,
	normalizedServerUrl: string
): { grant: string; room: string } {
	const value = roomUrl.toString();
	const roomPrefix = `${ normalizedServerUrl }/`;

	if ( ! value.startsWith( roomPrefix ) ) {
		throw new Error( 'Room URL must begin with the exact normalized server URL' );
	}

	const remainder = value.slice( roomPrefix.length );
	const queryIndex = remainder.indexOf( '?' );
	const room = queryIndex === -1 ? remainder : remainder.slice( 0, queryIndex );
	const query = queryIndex === -1 ? '' : remainder.slice( queryIndex + 1 );
	const grant = new URLSearchParams( query ).get( 'auth' );

	if ( room.length === 0 ) {
		throw new Error( 'Room URL must include a non-empty room' );
	}
	if ( ! grant ) {
		throw new Error( 'Room URL must include a non-empty auth grant' );
	}

	return { grant, room };
}

function createCloseEvent( code: number ): CloseEvent {
	if ( typeof CloseEvent !== 'undefined' ) {
		return new CloseEvent( 'close', { code } );
	}
	return Object.assign( new Event( 'close' ), { code } ) as CloseEvent;
}

/**
 * Create the WebSocket constructor supplied to each y-websocket provider.
 * The returned constructor shares one physical multiplex socket within this
 * closure while exposing a normal WebSocket-shaped object per logical room.
 */
export function createSharedWebSocketAdapter(
	serverUrl: string,
	PhysicalWebSocket: typeof WebSocket = WebSocket
): typeof WebSocket {
	const normalizedServerUrl = normalizeServerUrl( serverUrl );
	let physicalSocket: WebSocket | null = null;
	const virtualSockets = new Map< string, SharedWebSocket >();

	class SharedWebSocket {
		public static readonly CONNECTING = 0;
		public static readonly OPEN = 1;
		public static readonly CLOSING = 2;
		public static readonly CLOSED = 3;

		public readonly CONNECTING = SharedWebSocket.CONNECTING;
		public readonly OPEN = SharedWebSocket.OPEN;
		public readonly CLOSING = SharedWebSocket.CLOSING;
		public readonly CLOSED = SharedWebSocket.CLOSED;

		public binaryType: BinaryType = 'blob';
		public readonly bufferedAmount = 0;
		public readonly extensions = '';
		public onclose: ( ( this: WebSocket, ev: CloseEvent ) => unknown ) | null = null;
		public onerror: ( ( this: WebSocket, ev: Event ) => unknown ) | null = null;
		public onmessage: ( ( this: WebSocket, ev: MessageEvent ) => unknown ) | null = null;
		public onopen: ( ( this: WebSocket, ev: Event ) => unknown ) | null = null;
		public readonly protocol = '';
		public readyState = SharedWebSocket.CONNECTING;
		public readonly url: string;
		public readonly grant: string;
		public readonly room: string;

		public constructor( roomUrl: string | URL, _protocols?: string | string[] ) {
			this.url = roomUrl.toString();
			const { grant, room } = parseRoomUrl( roomUrl, normalizedServerUrl );
			this.grant = grant;
			this.room = room;
			const subscription = { type: 'subscribe', room, grant } as const;
			// Validate a deferred subscribe before any physical or virtual state
			// is created.
			encodeMessage( subscription );
			if ( virtualSockets.has( room ) ) {
				throw new Error( `Room is already registered: ${ room }` );
			}

			if ( physicalSocket === null ) {
				openPhysicalSocket( grant );
			} else if ( physicalSocket.readyState === PhysicalWebSocket.OPEN ) {
				sendPhysicalMessage( subscription );
			}

			virtualSockets.set( room, this );
		}

		public close( code = 1000, _reason?: string ): void {
			closeVirtualSocket( this, createCloseEvent( code ), true );
		}

		public send( data: string | ArrayBufferLike | Blob | ArrayBufferView ): void {
			if ( this.readyState !== SharedWebSocket.OPEN ) {
				throw new DOMException( 'WebSocket is not open', 'InvalidStateError' );
			}
			if ( ! ArrayBuffer.isView( data ) && ! ( data instanceof ArrayBuffer ) ) {
				throw new TypeError( 'Multiplex WebSocket data must be binary' );
			}
			const payload = ArrayBuffer.isView( data )
				? new Uint8Array( data.buffer, data.byteOffset, data.byteLength )
				: new Uint8Array( data );
			try {
				sendPhysicalMessage( { type: 'data', room: this.room, payload } );
			} catch ( error: unknown ) {
				closePhysicalSocketNormally();
				throw error;
			}
		}
	}

	function closeVirtualSocket(
		virtualSocket: SharedWebSocket,
		event: CloseEvent,
		sendUnsubscribe: boolean
	): void {
		if (
			virtualSocket.readyState === SharedWebSocket.CLOSING ||
			virtualSocket.readyState === SharedWebSocket.CLOSED
		) {
			return;
		}

		virtualSocket.readyState = SharedWebSocket.CLOSING;
		if ( virtualSockets.get( virtualSocket.room ) === virtualSocket ) {
			virtualSockets.delete( virtualSocket.room );
		}
		let unsubscribeFailed = false;
		if ( sendUnsubscribe ) {
			try {
				sendPhysicalMessage( { type: 'unsubscribe', room: virtualSocket.room } );
			} catch {
				unsubscribeFailed = true;
			}
		}
		virtualSocket.readyState = SharedWebSocket.CLOSED;
		try {
			virtualSocket.onclose?.call( virtualSocket as unknown as WebSocket, event );
		} finally {
			if ( unsubscribeFailed || virtualSockets.size === 0 ) {
				closePhysicalSocketNormally();
			}
		}
	}

	function closePhysicalSocketNormally(): void {
		if (
			physicalSocket !== null &&
			physicalSocket.readyState !== PhysicalWebSocket.CLOSING &&
			physicalSocket.readyState !== PhysicalWebSocket.CLOSED
		) {
			physicalSocket.close();
		}
	}

	function sendPhysicalMessage( message: ProtocolMessage ): void {
		if ( physicalSocket?.readyState === PhysicalWebSocket.OPEN ) {
			physicalSocket.send( encodeMessage( message ) );
		}
	}

	function openPhysicalSocket( grant: string ): void {
		const socket = new PhysicalWebSocket(
			`${ normalizedServerUrl }/multiplex?auth=${ encodeURIComponent( grant ) }`,
			MULTIPLEX_SUBPROTOCOL
		);
		physicalSocket = socket;
		socket.binaryType = 'arraybuffer';

		socket.onopen = () => {
			if ( physicalSocket !== socket ) {
				return;
			}
			for ( const [ room, virtualSocket ] of virtualSockets ) {
				if ( socket.readyState !== PhysicalWebSocket.OPEN ) {
					break;
				}
				if ( virtualSocket.readyState === SharedWebSocket.CONNECTING ) {
					try {
						sendPhysicalMessage( {
							type: 'subscribe',
							room,
							grant: virtualSocket.grant,
						} );
					} catch {
						closePhysicalSocketNormally();
						break;
					}
				}
			}
		};

		socket.onmessage = event => {
			if ( physicalSocket !== socket ) {
				return;
			}

			let message: ProtocolMessage;
			try {
				message = decodeMessage( new Uint8Array( event.data as ArrayBuffer ) );
			} catch {
				socket.close( MULTIPLEX_PROTOCOL_FAILURE_CLOSE_CODE );
				return;
			}

			switch ( message.type ) {
				case 'subscribed': {
					const virtualSocket = virtualSockets.get( message.room );
					if ( virtualSocket === undefined ) {
						return;
					}
					if ( virtualSocket.readyState === SharedWebSocket.CONNECTING ) {
						virtualSocket.readyState = SharedWebSocket.OPEN;
						virtualSocket.onopen?.call(
							virtualSocket as unknown as WebSocket,
							new Event( 'open' )
						);
					}
					return;
				}

				case 'data': {
					const virtualSocket = virtualSockets.get( message.room );
					if ( virtualSocket === undefined || virtualSocket.readyState !== SharedWebSocket.OPEN ) {
						return;
					}
					const data = message.payload.slice().buffer;
					virtualSocket.onmessage?.call(
						virtualSocket as unknown as WebSocket,
						new MessageEvent( 'message', { data } )
					);
					return;
				}

				case 'room_closed':
					{
						const virtualSocket = virtualSockets.get( message.room );
						if ( virtualSocket !== undefined ) {
							closeVirtualSocket(
								virtualSocket,
								markAsRoomCloseEvent( createCloseEvent( message.code ) ),
								false
							);
						}
					}
					return;

				case 'subscribe':
				case 'unsubscribe':
					socket.close( MULTIPLEX_PROTOCOL_FAILURE_CLOSE_CODE );
			}
		};

		socket.onerror = event => {
			if ( physicalSocket !== socket ) {
				return;
			}

			for ( const virtualSocket of [ ...virtualSockets.values() ] ) {
				try {
					virtualSocket.onerror?.call( virtualSocket as unknown as WebSocket, event );
				} catch {
					// One consumer callback must not block error fan-out.
				}
			}
		};

		socket.onclose = event => {
			if ( physicalSocket !== socket ) {
				return;
			}

			physicalSocket = null;
			const sockets = [ ...virtualSockets.values() ];
			virtualSockets.clear();
			for ( const virtualSocket of sockets ) {
				if (
					virtualSocket.readyState === SharedWebSocket.CLOSING ||
					virtualSocket.readyState === SharedWebSocket.CLOSED
				) {
					continue;
				}
				virtualSocket.readyState = SharedWebSocket.CLOSING;
				virtualSocket.readyState = SharedWebSocket.CLOSED;
				try {
					virtualSocket.onclose?.call( virtualSocket as unknown as WebSocket, event );
				} catch {
					// One consumer callback must not block close fan-out.
				}
			}
		};
	}

	return SharedWebSocket as unknown as typeof WebSocket;
}
