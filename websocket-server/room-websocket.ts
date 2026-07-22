import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';

import { encodeMessage } from './protocol';

import type { Data } from 'ws';

interface PhysicalSender {
	send(
		data: Data | Uint8Array,
		options?: { binary?: boolean },
		callback?: ( error?: Error ) => void
	): void;
}

type SendCallback = ( error?: Error ) => void;

interface QueuedSend {
	payload: Uint8Array;
	callback?: SendCallback;
}

function toUint8Array( data: Data | Uint8Array ): Uint8Array {
	if ( typeof data === 'string' ) {
		return new TextEncoder().encode( data );
	}
	if ( Array.isArray( data ) ) {
		return new Uint8Array( Buffer.concat( data ) );
	}
	if ( data instanceof ArrayBuffer ) {
		return new Uint8Array( data );
	}
	return new Uint8Array( data.buffer, data.byteOffset, data.byteLength );
}

/** A room-scoped WebSocket-compatible transport for y-websocket-server. */
export class RoomWebSocket extends EventEmitter {
	public readonly CONNECTING = WebSocket.CONNECTING;
	public readonly OPEN = WebSocket.OPEN;
	public readonly CLOSING = WebSocket.CLOSING;
	public readonly CLOSED = WebSocket.CLOSED;
	public binaryType: 'arraybuffer' | 'nodebuffer' | 'fragments' = 'arraybuffer';
	public readyState: number = WebSocket.OPEN;

	private active = false;
	private readonly queuedSends: QueuedSend[] = [];

	public constructor(
		private readonly room: string,
		private readonly physical: PhysicalSender
	) {
		super();
	}

	public activate(): void {
		if ( this.active || this.readyState !== WebSocket.OPEN ) {
			return;
		}
		this.active = true;
		for ( const queued of this.queuedSends.splice( 0 ) ) {
			this.sendEnvelope( queued.payload, queued.callback );
			if ( this.readyState !== WebSocket.OPEN ) {
				return;
			}
		}
	}

	public send( data: Data | Uint8Array, callback?: SendCallback ): void;
	public send(
		data: Data | Uint8Array,
		options: { binary?: boolean },
		callback?: SendCallback
	): void;
	public send(
		data: Data | Uint8Array,
		optionsOrCallback?: { binary?: boolean } | SendCallback,
		callback?: SendCallback
	): void {
		const sendCallback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
		if ( this.readyState !== WebSocket.OPEN ) {
			sendCallback?.( new Error( 'Room WebSocket is closed' ) );
			return;
		}

		const payload = toUint8Array( data );
		if ( ! this.active ) {
			this.queuedSends.push( { payload, callback: sendCallback } );
			return;
		}
		this.sendEnvelope( payload, sendCallback );
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
		this.queuedSends.splice( 0 );
		this.emit( 'close', 1000, Buffer.alloc( 0 ) );
	}

	private sendEnvelope( payload: Uint8Array, callback?: SendCallback ): void {
		const envelope = encodeMessage( { type: 'data', room: this.room, payload } );
		let completed = false;
		const complete = ( error?: Error ): void => {
			if ( completed ) {
				return;
			}
			completed = true;
			if ( error ) {
				this.emit( 'physical-send-error', error );
			}
			callback?.( error );
		};

		try {
			this.physical.send( envelope, { binary: true }, complete );
		} catch ( error ) {
			if ( completed ) {
				throw error;
			}
			complete( error instanceof Error ? error : new Error( String( error ) ) );
		}
	}
}
