import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';

type SendCallback = ( error?: Error ) => void;
type RoomSender = ( payload: Uint8Array, callback?: SendCallback ) => void;

/** A room-scoped WebSocket-compatible transport for y-websocket-server. */
export class RoomWebSocket extends EventEmitter {
	public readonly CONNECTING = WebSocket.CONNECTING;
	public readonly OPEN = WebSocket.OPEN;
	public readonly CLOSING = WebSocket.CLOSING;
	public readonly CLOSED = WebSocket.CLOSED;
	public binaryType: 'arraybuffer' | 'nodebuffer' | 'fragments' = 'arraybuffer';
	public readyState: number = WebSocket.OPEN;

	public constructor( private readonly sendPayload: RoomSender ) {
		super();
	}

	public send(
		payload: Uint8Array,
		optionsOrCallback?: { binary?: boolean } | SendCallback,
		callback?: SendCallback
	): void {
		const sendCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
		if ( this.readyState !== WebSocket.OPEN ) {
			sendCallback?.( new Error( 'Room WebSocket is closed' ) );
			return;
		}

		this.sendPayload( payload, sendCallback );
	}

	public ping(): void {
		if ( this.readyState === WebSocket.OPEN ) {
			this.emit( 'pong', Buffer.alloc( 0 ) );
		}
	}

	public close(): void {
		if ( this.readyState === WebSocket.CLOSED ) {
			return;
		}
		this.readyState = WebSocket.CLOSED;
		this.emit( 'close', 1000, Buffer.alloc( 0 ) );
	}
}
