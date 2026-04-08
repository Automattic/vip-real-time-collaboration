/**
 * MultiplexedRoomProvider
 *
 * Handles Y.js sync and awareness protocols for a single room over a
 * MultiplexedConnection. This replaces y-websocket's WebsocketProvider by
 * calling y-protocols functions directly.
 *
 * Lifecycle:
 *   1. Created with a reference to the shared MultiplexedConnection
 *   2. Fetches a per-room JWT and calls connection.joinRoom()
 *   3. On room:joined — sends sync step 1 + initial awareness
 *   4. On incoming binary — dispatches by y-protocols message type
 *   5. On local doc/awareness changes — encodes and sends via connection
 *   6. On destroy — removes awareness, leaves room
 */
// eslint-disable-next-line import/no-extraneous-dependencies -- lib0 is a transitive dependency via y-protocols
import * as decoding from 'lib0/decoding';
// eslint-disable-next-line import/no-extraneous-dependencies -- lib0 is a transitive dependency via y-protocols
import * as encoding from 'lib0/encoding';
import {
	applyAwarenessUpdate,
	encodeAwarenessUpdate,
	removeAwarenessStates,
} from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';

import { Logger } from '@/utilities/logger';
import { MESSAGE_AWARENESS, MESSAGE_QUERY_AWARENESS, MESSAGE_SYNC } from '@/utilities/mux-protocol';

import type { MultiplexedConnection, RoomHandler } from '@/multiplexed-connection';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

const PROVIDER_ORIGIN = 'multiplexed-room-provider';

const logger = new Logger( 'multiplexed-room-provider' );

export class MultiplexedRoomProvider implements RoomHandler {
	private synced = false;
	private docUpdateHandler: ( ( update: Uint8Array, origin: unknown ) => void ) | null = null;
	private awarenessUpdateHandler:
		| ( (
				changes: { added: number[]; updated: number[]; removed: number[] },
				origin: unknown
		  ) => void )
		| null = null;
	private destroyed = false;

	constructor(
		private readonly connection: MultiplexedConnection,
		private readonly room: string,
		private readonly doc: Y.Doc,
		private readonly awareness: Awareness | undefined,
		private readonly onSync: () => void,
		private readonly onStatus: (
			status: 'connected' | 'connecting' | 'disconnected',
			error?: { code: number; message: string }
		) => void,
		private readonly authProvider?: () => Promise< string >
	) {
		this.setupDocListener();
		this.setupAwarenessListener();
	}

	/**
	 * Join the room with an auth token.
	 */
	public join( auth: string ): void {
		this.onStatus( 'connecting' );
		this.connection.joinRoom( this.room, auth, this );
	}

	/**
	 * Re-join with a fresh auth token (e.g., after reconnect).
	 */
	public rejoin( auth: string ): void {
		this.synced = false;
		this.onStatus( 'connecting' );
		this.connection.joinRoom( this.room, auth, this );
	}

	/**
	 * Clean up: remove awareness, leave room, detach listeners.
	 */
	public destroy(): void {
		if ( this.destroyed ) {
			return;
		}
		this.destroyed = true;

		// Remove our awareness state so other clients see us leave.
		if ( this.awareness ) {
			removeAwarenessStates( this.awareness, [ this.doc.clientID ], PROVIDER_ORIGIN );
		}

		// Detach listeners.
		if ( this.docUpdateHandler ) {
			this.doc.off( 'update', this.docUpdateHandler );
			this.docUpdateHandler = null;
		}
		if ( this.awarenessUpdateHandler && this.awareness ) {
			this.awareness.off( 'update', this.awarenessUpdateHandler );
			this.awarenessUpdateHandler = null;
		}

		this.connection.leaveRoom( this.room );
	}

	// ── RoomHandler implementation ──────────────────────────────

	/**
	 * Called when the server confirms our room join.
	 * Initiates the sync handshake and sends initial awareness.
	 */
	public onJoined(): void {
		logger.info( `Joined room: ${ this.room }` );
		this.onStatus( 'connected' );

		// Send sync step 1 (our state vector).
		this.sendSyncStep1();

		// Send our awareness state.
		this.sendAwarenessState();

		// Query other clients' awareness.
		this.sendQueryAwareness();
	}

	/**
	 * Called when a room-level error occurs (e.g., auth failure).
	 */
	public onError( code: number, message: string ): void {
		logger.error( `Room error for ${ this.room }: code=${ code } ${ message }` );
		this.onStatus( 'disconnected', { code, message } );
	}

	/**
	 * Called when we've been removed from a room.
	 */
	public onLeft(): void {
		logger.info( `Left room: ${ this.room }` );
	}

	/**
	 * Called when the underlying WebSocket connects or disconnects.
	 */
	public onConnectionStateChange( connected: boolean ): void {
		if ( ! connected ) {
			this.synced = false;
			this.onStatus( 'disconnected' );

			// Remove remote awareness states on disconnect.
			if ( this.awareness ) {
				const remoteStates = Array.from( this.awareness.getStates().keys() ).filter(
					clientId => clientId !== this.doc.clientID
				);
				removeAwarenessStates( this.awareness, remoteStates, PROVIDER_ORIGIN );
			}
			return;
		}

		// On reconnect, fetch a fresh room token and rejoin.
		if ( this.destroyed ) {
			return;
		}

		if ( this.authProvider ) {
			void this.refreshAndRejoin();
		}
	}

	private async refreshAndRejoin(): Promise< void > {
		try {
			if ( ! this.authProvider || this.destroyed ) {
				return;
			}
			const freshToken = await this.authProvider();
			if ( ! this.destroyed ) {
				this.rejoin( freshToken );
			}
		} catch ( error ) {
			logger.error( `Failed to refresh room token for ${ this.room }`, { error } );
			this.onStatus( 'disconnected' );
		}
	}

	/**
	 * Called when a binary y-protocols message arrives for this room.
	 */
	public onBinaryMessage( payload: Uint8Array ): void {
		if ( this.destroyed || payload.byteLength === 0 ) {
			return;
		}

		const decoder = decoding.createDecoder( payload );
		const messageType = decoding.readVarUint( decoder );

		switch ( messageType ) {
			case MESSAGE_SYNC:
				this.handleSyncMessage( decoder );
				break;

			case MESSAGE_AWARENESS:
				this.handleAwarenessMessage( decoder );
				break;

			case MESSAGE_QUERY_AWARENESS:
				// Server is asking for our awareness state.
				this.sendAwarenessState();
				break;

			default:
				logger.debug( `Unknown message type: ${ messageType }` );
		}
	}

	// ── Sync protocol ───────────────────────────────────────────

	private handleSyncMessage( decoder: decoding.Decoder ): void {
		const encoder = encoding.createEncoder();
		encoding.writeVarUint( encoder, MESSAGE_SYNC );

		/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- lib0 version mismatch */
		const syncMessageType = syncProtocol.readSyncMessage(
			decoder as any,
			encoder as any,
			this.doc,
			PROVIDER_ORIGIN
		);
		/* eslint-enable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */

		// If readSyncMessage produced a response (e.g., sync step 2 in reply
		// to sync step 1), send it back.
		if ( encoding.length( encoder ) > 1 ) {
			this.connection.sendBinary( this.room, encoding.toUint8Array( encoder ) );
		}

		// syncMessageType 1 = sync step 2, which means initial sync is complete.
		if ( syncMessageType === 1 && ! this.synced ) {
			this.synced = true;
			this.onSync();
		}
	}

	private sendSyncStep1(): void {
		const encoder = encoding.createEncoder();
		encoding.writeVarUint( encoder, MESSAGE_SYNC );
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- lib0 version mismatch
		syncProtocol.writeSyncStep1( encoder as any, this.doc );
		this.connection.sendBinary( this.room, encoding.toUint8Array( encoder ) );
	}

	// ── Awareness protocol ──────────────────────────────────────

	private handleAwarenessMessage( decoder: decoding.Decoder ): void {
		if ( ! this.awareness ) {
			return;
		}

		const update = decoding.readVarUint8Array( decoder );
		applyAwarenessUpdate( this.awareness, update, PROVIDER_ORIGIN );
	}

	private sendAwarenessState(): void {
		if ( ! this.awareness ) {
			return;
		}

		const encoder = encoding.createEncoder();
		encoding.writeVarUint( encoder, MESSAGE_AWARENESS );
		encoding.writeVarUint8Array(
			encoder,
			encodeAwarenessUpdate( this.awareness, [ this.doc.clientID ] )
		);
		this.connection.sendBinary( this.room, encoding.toUint8Array( encoder ) );
	}

	private sendQueryAwareness(): void {
		const encoder = encoding.createEncoder();
		encoding.writeVarUint( encoder, MESSAGE_QUERY_AWARENESS );
		this.connection.sendBinary( this.room, encoding.toUint8Array( encoder ) );
	}

	// ── Local change listeners ──────────────────────────────────

	private setupDocListener(): void {
		this.docUpdateHandler = ( update: Uint8Array, origin: unknown ): void => {
			// Don't echo back updates that came from us (the provider).
			if ( origin === PROVIDER_ORIGIN ) {
				return;
			}

			const encoder = encoding.createEncoder();
			encoding.writeVarUint( encoder, MESSAGE_SYNC );
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- lib0 version mismatch
			syncProtocol.writeUpdate( encoder as any, update );
			this.connection.sendBinary( this.room, encoding.toUint8Array( encoder ) );
		};

		this.doc.on( 'update', this.docUpdateHandler );
	}

	private setupAwarenessListener(): void {
		if ( ! this.awareness ) {
			return;
		}

		this.awarenessUpdateHandler = (
			{ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
			origin: unknown
		): void => {
			// Don't echo back awareness updates that came from us (the provider).
			if ( origin === PROVIDER_ORIGIN ) {
				return;
			}

			const changedClients = added.concat( updated, removed );
			const encoder = encoding.createEncoder();
			encoding.writeVarUint( encoder, MESSAGE_AWARENESS );
			encoding.writeVarUint8Array(
				encoder,
				encodeAwarenessUpdate( this.awareness as Awareness, changedClients )
			);
			this.connection.sendBinary( this.room, encoding.toUint8Array( encoder ) );
		};

		this.awareness.on( 'update', this.awarenessUpdateHandler );
	}
}
