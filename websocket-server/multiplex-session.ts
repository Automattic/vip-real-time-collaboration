import { setupWSConnection } from '@y/websocket-server/utils';
import { TokenExpiredError } from 'jsonwebtoken';
import { WebSocket, type RawData } from 'ws';

import {
	verifyTokenGrant,
	verifyTokenGrantIgnoringExpiration,
	type SyncTokenPayload,
} from './auth';
import { CONNECTION_TIMEOUT_CLOSE } from './config';
import {
	recordConnectionFailure,
	recordPeakRoomsPerConnection,
	recordRoomClose,
	recordRoomOpen,
} from './metrics';
import { startPhysicalHeartbeat } from './physical-heartbeat';
import { decodeMessage, encodeMessage, type ProtocolMessage } from './protocol';
import { RoomWebSocket } from './room-websocket';

import type { IncomingMessage } from 'node:http';

const ROOM_REJECTED_CLOSE_CODE = 4004;
const ROOM_INTERRUPTED_CLOSE_CODE = 4005;
const MAX_AUTHORIZATION_BYPASS_ATTEMPTS = 2;

function effectiveClientId( payload: SyncTokenPayload ): string {
	return payload.wp_client_id ?? payload.connection_id ?? '';
}

function toUint8Array( data: RawData ): Uint8Array {
	if ( Array.isArray( data ) ) {
		return new Uint8Array( Buffer.concat( data ) );
	}
	if ( data instanceof ArrayBuffer ) {
		return new Uint8Array( data );
	}
	return new Uint8Array( data.buffer, data.byteOffset, data.byteLength );
}

/** Owns the authorized logical-room adapters carried by one physical socket. */
export class MultiplexSession {
	private readonly rooms = new Map< string, RoomWebSocket >();
	private readonly closedRooms = new Set< string >();
	private readonly expectedRoomCloses = new Set< RoomWebSocket >();
	private authorizationBypassAttempts = 0;
	private peakRoomCount = 0;
	private started = false;

	public constructor(
		private readonly physical: WebSocket,
		private readonly request: IncomingMessage,
		private readonly initialGrant: SyncTokenPayload,
		private readonly jwtSecret: string
	) {}

	public start(): void {
		if ( this.started ) {
			return;
		}
		this.started = true;
		this.physical.on( 'message', this.handlePhysicalMessage );
		this.physical.once( 'close', this.handlePhysicalClose );
		startPhysicalHeartbeat( this.physical, {
			hasRooms: () => this.rooms.size > 0,
			onEmpty: () => {
				recordConnectionFailure( 'zero_room_timeout' );
				this.closePhysical( CONNECTION_TIMEOUT_CLOSE.code, CONNECTION_TIMEOUT_CLOSE.reason );
			},
			onUnresponsive: () => this.cleanupRooms(),
		} );
	}

	private readonly handlePhysicalMessage = ( data: RawData, isBinary: boolean ): void => {
		if ( this.physical.readyState !== WebSocket.OPEN ) {
			this.cleanupRooms();
			return;
		}
		if ( ! isBinary ) {
			this.closePhysical( 1002, 'Multiplex messages must be binary' );
			return;
		}

		let message;
		try {
			message = decodeMessage( toUint8Array( data ) );
		} catch {
			this.closePhysical( 1002, 'Malformed multiplex message' );
			return;
		}

		switch ( message.type ) {
			case 'subscribe':
				this.subscribe( message.room, message.grant );
				return;
			case 'data': {
				const roomSocket = this.rooms.get( message.room );
				if ( ! roomSocket ) {
					if ( this.closedRooms.has( message.room ) ) {
						return;
					}
					this.rejectAuthorizationBypass( message.room );
					return;
				}
				roomSocket.emit( 'message', message.payload, true );
				return;
			}
			case 'unsubscribe':
				this.unsubscribe( message.room );
				return;
			case 'subscribed':
			case 'room_closed':
				this.closePhysical( 1002, 'Unexpected server multiplex message' );
				return;
			default: {
				const exhaustive: never = message;
				return exhaustive;
			}
		}
	};

	private readonly handlePhysicalClose = (): void => {
		recordPeakRoomsPerConnection( this.peakRoomCount );
		this.cleanupRooms();
	};

	private cleanupRooms(): void {
		for ( const roomSocket of Array.from( this.rooms.values() ) ) {
			this.closeRoom( roomSocket );
		}
	}

	private closePhysical( code: number, reason: string ): void {
		this.cleanupRooms();
		this.physical.close( code, reason );
	}

	private readonly handlePhysicalSendError = (): void => {
		this.cleanupRooms();
		if ( this.physical.readyState === WebSocket.OPEN ) {
			this.physical.close( 1011, 'Shared transport send failed' );
		}
	};

	private sendPhysicalMessage(
		message: Extract< ProtocolMessage, { type: 'subscribed' | 'room_closed' | 'data' } >,
		callback?: ( error?: Error ) => void
	): boolean {
		let completed = false;
		let failed = false;
		const complete = ( error?: Error ): void => {
			if ( completed ) {
				return;
			}
			completed = true;
			if ( error ) {
				failed = true;
				this.handlePhysicalSendError();
			}
			callback?.( error );
		};

		try {
			this.physical.send( encodeMessage( message ), { binary: true }, complete );
		} catch ( error ) {
			if ( completed ) {
				throw error;
			}
			complete( error instanceof Error ? error : new Error( String( error ) ) );
		}

		return ! failed;
	}

	private subscribe( room: string, grant: string ): void {
		const existingRoomSocket = this.rooms.get( room );
		if ( existingRoomSocket ) {
			this.sendPhysicalMessage( { type: 'subscribed', room } );
			return;
		}
		let payload: SyncTokenPayload;
		let expired = false;
		try {
			payload = verifyTokenGrant( grant, this.jwtSecret );
		} catch ( error ) {
			if ( ! ( error instanceof TokenExpiredError ) ) {
				this.rejectRoom( room );
				return;
			}
			try {
				payload = verifyTokenGrantIgnoringExpiration( grant, this.jwtSecret );
				expired = true;
			} catch {
				this.rejectRoom( room );
				return;
			}
		}

		const matchesPhysicalIdentity =
			payload.user_id === this.initialGrant.user_id &&
			payload.blog_id === this.initialGrant.blog_id &&
			effectiveClientId( payload ) === effectiveClientId( this.initialGrant );
		if ( payload.room_name !== room || ! matchesPhysicalIdentity ) {
			this.rejectAuthorizationBypass( room );
			return;
		}
		if ( expired ) {
			this.sendRoomClosed( room, ROOM_INTERRUPTED_CLOSE_CODE );
			return;
		}

		this.addRoom( payload.room_name );
	}

	private addRoom( room: string ): void {
		const roomSocket = new RoomWebSocket( ( payload, callback ) => {
			this.sendPhysicalMessage( { type: 'data', room, payload }, callback );
		} );
		this.rooms.set( room, roomSocket );
		this.peakRoomCount = Math.max( this.peakRoomCount, this.rooms.size );
		this.closedRooms.delete( room );
		roomSocket.once( 'close', () => {
			const expectedClose = this.expectedRoomCloses.delete( roomSocket );
			if ( this.rooms.get( room ) === roomSocket ) {
				this.rooms.delete( room );
				this.closedRooms.add( room );
				recordRoomClose();
				if ( ! expectedClose && this.physical.readyState === WebSocket.OPEN ) {
					this.sendRoomClosed( room, ROOM_INTERRUPTED_CLOSE_CODE );
				}
			}
		} );

		recordRoomOpen();
		if ( ! this.sendPhysicalMessage( { type: 'subscribed', room } ) ) {
			return;
		}
		setupWSConnection( roomSocket as unknown as WebSocket, this.request, { docName: room } );
	}

	private unsubscribe( room: string ): void {
		const roomSocket = this.rooms.get( room );
		if ( ! roomSocket ) {
			// A close can race with a room-scoped rejection or be repeated by the
			// client, so leaving an unknown room is intentionally idempotent.
			return;
		}
		this.closeRoom( roomSocket );
	}

	private closeRoom( roomSocket: RoomWebSocket ): void {
		this.expectedRoomCloses.add( roomSocket );
		roomSocket.close();
	}

	private rejectAuthorizationBypass( room: string ): void {
		this.authorizationBypassAttempts += 1;
		this.rejectRoom( room );
		if ( this.authorizationBypassAttempts >= MAX_AUTHORIZATION_BYPASS_ATTEMPTS ) {
			this.closePhysical( 1008, 'Repeated room authorization failure' );
		}
	}

	private rejectRoom( room: string ): void {
		this.sendRoomClosed( room, ROOM_REJECTED_CLOSE_CODE );
	}

	private sendRoomClosed( room: string, code: number ): void {
		this.sendPhysicalMessage( { type: 'room_closed', room, code } );
	}
}
