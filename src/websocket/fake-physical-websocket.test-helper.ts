import { encodeMessage } from '../../websocket-server/protocol';

export interface FakeCloseEvent extends Event {
	code: number;
}

export class FakePhysicalWebSocket {
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
		const bytes = ArrayBuffer.isView( data )
			? new Uint8Array( data.buffer, data.byteOffset, data.byteLength )
			: new Uint8Array( data );
		this.sent.push( new Uint8Array( bytes ) );
	}

	public close( code = 1000 ): void {
		if ( code !== 1000 && ( code < 3000 || code > 4999 ) ) {
			throw new DOMException( 'Invalid WebSocket close code', 'InvalidAccessError' );
		}
		this.readyState = FakePhysicalWebSocket.CLOSING;
		this.emitClose( code );
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

export function acknowledgeRoom( physical: FakePhysicalWebSocket, room: string ): void {
	physical.emitMessage( encodeMessage( { type: 'subscribed', room } ) );
}
