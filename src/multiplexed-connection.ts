/**
 * MultiplexedConnection
 *
 * Manages a single physical WebSocket connection over which multiple Y.js rooms
 * are multiplexed. Binary frames are room-prefixed, text frames carry JSON
 * control messages (join/leave/error).
 *
 * One instance is shared across all rooms in an editing session.
 */
import { Logger } from '@/utilities/logger';
import {
	decodeRoomMessage,
	parseControlMessage,
	encodeRoomMessage,
	serializeControlMessage,
} from '@/utilities/mux-protocol';

import type { ControlMessage } from '@/utilities/mux-protocol';

const logger = new Logger( 'multiplexed-connection' );

/**
 * Callback interface that a room provider implements to receive messages.
 */
export interface RoomHandler {
	onBinaryMessage( payload: Uint8Array ): void;
	onJoined(): void;
	onError( code: number, message: string ): void;
	onLeft(): void;
	onConnectionStateChange( connected: boolean ): void;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface MultiplexedConnectionOptions {
	maxBackoffMs?: number;
	onStateChange?: ( state: ConnectionState ) => void;
	/**
	 * Called during reconnection to fetch a fresh session token.
	 * If not provided, the last session token is reused (which may
	 * fail if it has expired).
	 */
	sessionAuthProvider?: () => Promise< string >;
}

const DEFAULT_MAX_BACKOFF_MS = 15000;

export class MultiplexedConnection {
	private ws: WebSocket | null = null;
	private rooms = new Map< string, RoomHandler >();
	private pendingJoins = new Map< string, { auth: string } >();
	private reconnectAttempts = 0;
	private state: ConnectionState = 'disconnected';
	private destroyed = false;
	private reconnectTimer: ReturnType< typeof setTimeout > | null = null;
	private lastSessionAuth: string | null = null;
	private readonly maxBackoffMs: number;
	private readonly onStateChange?: ( state: ConnectionState ) => void;
	private readonly sessionAuthProvider?: () => Promise< string >;

	constructor(
		private readonly serverUrl: string,
		options: MultiplexedConnectionOptions = {}
	) {
		this.maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
		this.onStateChange = options.onStateChange;
		this.sessionAuthProvider = options.sessionAuthProvider;
	}

	/**
	 * Open the physical WebSocket connection.
	 *
	 * @param sessionAuth Session-level JWT for the upgrade handshake.
	 */
	public connect( sessionAuth: string ): void {
		if ( this.destroyed ) {
			return;
		}

		this.lastSessionAuth = sessionAuth;
		this.setState( 'connecting' );

		const url = `${ this.serverUrl }/_mux?auth=${ encodeURIComponent( sessionAuth ) }`;
		const ws = new WebSocket( url );
		ws.binaryType = 'arraybuffer';

		ws.onopen = (): void => {
			this.reconnectAttempts = 0;
			this.setState( 'connected' );
			logger.info( 'Multiplexed WebSocket connected' );

			// Re-join any rooms that were pending or previously joined.
			this.rejoinRooms();
		};

		ws.onmessage = ( event: MessageEvent ): void => {
			if ( typeof event.data === 'string' ) {
				this.handleTextMessage( event.data );
			} else if ( event.data instanceof ArrayBuffer ) {
				this.handleBinaryMessage( new Uint8Array( event.data ) );
			}
		};

		ws.onclose = ( event: CloseEvent ): void => {
			logger.warn( `WebSocket closed: code=${ event.code } reason=${ event.reason }` );
			this.ws = null;
			this.setState( 'disconnected' );

			// Notify all rooms about disconnection.
			this.rooms.forEach( handler => handler.onConnectionStateChange( false ) );

			if ( ! this.destroyed ) {
				this.scheduleReconnect();
			}
		};

		ws.onerror = (): void => {
			logger.error( 'WebSocket error' );
		};

		this.ws = ws;
	}

	/**
	 * Register a room handler and send a join request.
	 */
	public joinRoom( room: string, auth: string, handler: RoomHandler ): void {
		this.rooms.set( room, handler );
		this.pendingJoins.set( room, { auth } );

		if ( this.isConnected() ) {
			this.sendJoinRoom( room, auth );
		}
	}

	/**
	 * Unregister a room and send a leave request.
	 */
	public leaveRoom( room: string ): void {
		this.rooms.delete( room );
		this.pendingJoins.delete( room );

		if ( this.isConnected() ) {
			this.sendControlMessage( { type: 'room:leave', room } );
		}
	}

	/**
	 * Send a binary y-protocols message for a specific room.
	 */
	public sendBinary( room: string, payload: Uint8Array ): void {
		if ( ! this.isConnected() ) {
			logger.debug( `Dropping binary message for ${ room } — not connected` );
			return;
		}

		const framed = encodeRoomMessage( room, payload );
		this.ws?.send( framed );
	}

	/**
	 * Update the auth token for a room (e.g., on token refresh).
	 */
	public updateRoomAuth( room: string, auth: string ): void {
		if ( this.pendingJoins.has( room ) ) {
			this.pendingJoins.set( room, { auth } );
		}
	}

	/**
	 * Tear down the connection and all room registrations.
	 */
	public destroy(): void {
		this.destroyed = true;

		if ( this.reconnectTimer ) {
			clearTimeout( this.reconnectTimer );
			this.reconnectTimer = null;
		}

		if ( this.ws ) {
			this.ws.onclose = null;
			this.ws.close();
			this.ws = null;
		}

		this.rooms.clear();
		this.pendingJoins.clear();
		this.setState( 'disconnected' );
	}

	public getRoomCount(): number {
		return this.rooms.size;
	}

	public isConnected(): boolean {
		return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
	}

	// ── Private ─────────────────────────────────────────────────

	private setState( state: ConnectionState ): void {
		if ( this.state === state ) {
			return;
		}
		this.state = state;
		this.onStateChange?.( state );
	}

	private handleTextMessage( data: string ): void {
		const msg = parseControlMessage( data );
		if ( ! msg ) {
			logger.warn( 'Received unrecognized text frame' );
			return;
		}

		switch ( msg.type ) {
			case 'room:joined': {
				const handler = this.rooms.get( msg.room );
				if ( handler ) {
					this.pendingJoins.delete( msg.room );
					handler.onJoined();
				}
				break;
			}

			case 'room:left': {
				const handler = this.rooms.get( msg.room );
				if ( handler ) {
					handler.onLeft();
				}
				break;
			}

			case 'room:error': {
				const handler = this.rooms.get( msg.room );
				if ( handler ) {
					handler.onError( msg.code, msg.message );
				}
				break;
			}

			case 'error': {
				logger.error( `Connection-level error: code=${ msg.code } ${ msg.message }` );
				break;
			}
		}
	}

	private handleBinaryMessage( data: Uint8Array ): void {
		try {
			const { room, payload } = decodeRoomMessage( data );
			const handler = this.rooms.get( room );

			if ( handler ) {
				handler.onBinaryMessage( payload );
			} else {
				logger.debug( `Received binary message for unknown room: ${ room }` );
			}
		} catch ( error ) {
			logger.error( 'Failed to decode binary frame', { error } );
		}
	}

	private sendJoinRoom( room: string, auth: string ): void {
		this.sendControlMessage( { type: 'room:join', room, auth } );
	}

	private sendControlMessage( msg: ControlMessage ): void {
		if ( ! this.isConnected() ) {
			return;
		}

		this.ws?.send( serializeControlMessage( msg ) );
	}

	private rejoinRooms(): void {
		// Clear stale pending joins — room handlers will re-join with
		// fresh tokens via their authProvider callbacks below.
		this.pendingJoins.clear();

		// Notify all room handlers about reconnection so they can fetch
		// fresh auth tokens and rejoin via their authProvider callbacks.
		this.rooms.forEach( handler => {
			handler.onConnectionStateChange( true );
		} );
	}

	private scheduleReconnect(): void {
		if ( this.destroyed || ! this.lastSessionAuth ) {
			return;
		}

		const backoffMs = Math.min( 1000 * 2 ** this.reconnectAttempts, this.maxBackoffMs );
		this.reconnectAttempts += 1;

		logger.warn( `Reconnecting in ${ Math.floor( backoffMs / 1000 ) }s...` );

		this.reconnectTimer = setTimeout( () => {
			this.reconnectTimer = null;

			if ( this.destroyed ) {
				return;
			}

			void this.reconnect();
		}, backoffMs );
	}

	private async reconnect(): Promise< void > {
		try {
			// Fetch a fresh session token if a provider is available,
			// otherwise fall back to the last token (may be expired).
			const sessionAuth = this.sessionAuthProvider
				? await this.sessionAuthProvider()
				: this.lastSessionAuth;

			if ( this.destroyed || ! sessionAuth ) {
				return;
			}

			this.connect( sessionAuth );
		} catch ( error ) {
			logger.error( 'Failed to refresh session token for reconnect', { error } );

			// Retry with backoff.
			if ( ! this.destroyed ) {
				this.scheduleReconnect();
			}
		}
	}
}
