/**
 * Multiplexed WebSocket Handler
 *
 * Handles a multiplexed WebSocket connection where multiple Y.js rooms
 * share a single physical WebSocket. Text frames carry JSON control
 * messages (join/leave), binary frames carry room-prefixed y-protocols data.
 *
 * Each room is independently authenticated via per-room JWTs sent in
 * room:join control messages. The initial WebSocket upgrade is authenticated
 * with a session-level JWT that proves user identity.
 */
// eslint-disable-next-line import/no-extraneous-dependencies -- lib0 is a transitive dependency via y-protocols
import * as decoding from 'lib0/decoding';
// eslint-disable-next-line import/no-extraneous-dependencies -- lib0 is a transitive dependency via y-protocols
import * as encoding from 'lib0/encoding';
// eslint-disable-next-line import/no-extraneous-dependencies -- y-protocols is a transitive dependency via yjs
import {
	applyAwarenessUpdate,
	encodeAwarenessUpdate,
	removeAwarenessStates,
} from 'y-protocols/awareness';
// eslint-disable-next-line import/no-extraneous-dependencies -- y-protocols is a transitive dependency via yjs
import * as syncProtocol from 'y-protocols/sync';

import { verifyRoomToken } from './auth';
import {
	decodeRoomMessage,
	encodeRoomMessage,
	parseControlMessage,
	serializeControlMessage,
	MESSAGE_SYNC,
	MESSAGE_AWARENESS,
	MESSAGE_QUERY_AWARENESS,
} from './mux-protocol';
import { subscribe, unsubscribe } from './room-registry';

import type { RoomSubscriber } from './room-registry';
import type { WebSocket } from 'ws';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

/**
 * Sentinel origin used only for awareness cleanup on disconnect.
 * Per-subscriber origins (unique objects) are used for doc/awareness
 * update relay — see handleRoomJoin.
 */
const MUX_CLEANUP_ORIGIN = 'multiplexed-handler';

interface RoomBinding {
	roomName: string;
	doc: Y.Doc;
	awareness: Awareness;
	subscriber: RoomSubscriber;
	/** Unique origin object for this subscriber — used to prevent echo-back. */
	origin: object;
	docUpdateHandler: ( update: Uint8Array, origin: unknown ) => void;
	awarenessUpdateHandler: (
		changes: { added: number[]; updated: number[]; removed: number[] },
		origin: unknown
	) => void;
}

/**
 * Set up a multiplexed WebSocket connection.
 *
 * @param ws        The WebSocket connection (already upgraded and authenticated at session level).
 * @param wpClientId The client ID from the session token.
 * @param jwtSecret  The JWT secret for verifying per-room tokens.
 */
export function handleMultiplexedConnection(
	ws: WebSocket,
	wpClientId: string,
	jwtSecret: string
): void {
	const roomBindings = new Map< string, RoomBinding >();

	ws.on( 'message', ( data: Buffer, isBinary: boolean ) => {
		if ( isBinary ) {
			handleBinaryMessage( ws, data, roomBindings );
		} else {
			handleTextMessage( ws, data.toString( 'utf-8' ), roomBindings, wpClientId, jwtSecret );
		}
	} );

	ws.on( 'close', () => {
		// Clean up all room subscriptions.
		roomBindings.forEach( binding => {
			cleanupBinding( binding );
		} );
		roomBindings.clear();
	} );
}

// ── Control messages ────────────────────────────────────────────

function handleTextMessage(
	ws: WebSocket,
	data: string,
	roomBindings: Map< string, RoomBinding >,
	wpClientId: string,
	jwtSecret: string
): void {
	const msg = parseControlMessage( data );
	if ( ! msg ) {
		return;
	}

	switch ( msg.type ) {
		case 'room:join':
			handleRoomJoin( ws, msg.room, msg.auth, roomBindings, wpClientId, jwtSecret );
			break;

		case 'room:leave':
			handleRoomLeave( ws, msg.room, roomBindings );
			break;
	}
}

function handleRoomJoin(
	ws: WebSocket,
	roomName: string,
	authToken: string,
	roomBindings: Map< string, RoomBinding >,
	_wpClientId: string,
	jwtSecret: string
): void {
	// Verify the per-room JWT.
	const authResult = verifyRoomToken( authToken, roomName, jwtSecret );

	if ( ! authResult.valid ) {
		ws.send(
			serializeControlMessage( {
				type: 'room:error',
				room: roomName,
				code: 4003,
				message: `Room auth failed: ${ authResult.reason }`,
			} )
		);
		return;
	}

	// If already joined, clean up the old binding first (handles re-join on reconnect).
	const existingBinding = roomBindings.get( roomName );
	if ( existingBinding ) {
		cleanupBinding( existingBinding );
		roomBindings.delete( roomName );
	}

	// Unique origin per subscriber — prevents echo-back while allowing
	// relay between different mux subscribers on the same doc.
	const subscriberOrigin = {};

	// Subscribe to the room.
	const subscriber: RoomSubscriber = {
		clientId: 0, // Will be set from first sync message.
		send( payload: Uint8Array ): void {
			if ( ws.readyState === ws.OPEN ) {
				ws.send( encodeRoomMessage( roomName, payload ) );
			}
		},
	};

	const { doc, awareness } = subscribe( roomName, subscriber );

	// Listen for doc updates and relay to this subscriber.
	// Each subscriber's handler sends to its OWN subscriber only — other
	// subscribers have their own handlers. The origin check ensures we
	// don't echo a subscriber's own update back to them.
	const docUpdateHandler = ( update: Uint8Array, origin: unknown ): void => {
		if ( origin === subscriberOrigin ) {
			return;
		}
		const encoder = encoding.createEncoder();
		encoding.writeVarUint( encoder, MESSAGE_SYNC );
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- lib0 version mismatch
		syncProtocol.writeUpdate( encoder as any, update );
		subscriber.send( encoding.toUint8Array( encoder ) );
	};

	doc.on( 'update', docUpdateHandler );

	// Listen for awareness updates and relay to this subscriber.
	const awarenessUpdateHandler = (
		{ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
		origin: unknown
	): void => {
		if ( origin === subscriberOrigin ) {
			return;
		}
		const changedClients = added.concat( updated, removed );
		const encoder = encoding.createEncoder();
		encoding.writeVarUint( encoder, MESSAGE_AWARENESS );
		encoding.writeVarUint8Array( encoder, encodeAwarenessUpdate( awareness, changedClients ) );
		subscriber.send( encoding.toUint8Array( encoder ) );
	};

	awareness.on( 'update', awarenessUpdateHandler );

	// Store the binding.
	const binding: RoomBinding = {
		roomName,
		doc,
		awareness,
		subscriber,
		origin: subscriberOrigin,
		docUpdateHandler,
		awarenessUpdateHandler,
	};
	roomBindings.set( roomName, binding );

	// Confirm the join.
	ws.send( serializeControlMessage( { type: 'room:joined', room: roomName } ) );

	// Send sync step 1 (our state vector) so the client can sync.
	const syncEncoder = encoding.createEncoder();
	encoding.writeVarUint( syncEncoder, MESSAGE_SYNC );
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- lib0 version mismatch
	syncProtocol.writeSyncStep1( syncEncoder as any, doc );
	ws.send( encodeRoomMessage( roomName, encoding.toUint8Array( syncEncoder ) ) );

	// Send current awareness state.
	const awarenessStates = awareness.getStates();
	if ( awarenessStates.size > 0 ) {
		const awarenessEncoder = encoding.createEncoder();
		encoding.writeVarUint( awarenessEncoder, MESSAGE_AWARENESS );
		encoding.writeVarUint8Array(
			awarenessEncoder,
			encodeAwarenessUpdate( awareness, Array.from( awarenessStates.keys() ) )
		);
		ws.send( encodeRoomMessage( roomName, encoding.toUint8Array( awarenessEncoder ) ) );
	}

	// eslint-disable-next-line no-console
	console.log( `[mux-handler] Client joined room: ${ roomName }` );
}

function handleRoomLeave(
	ws: WebSocket,
	roomName: string,
	roomBindings: Map< string, RoomBinding >
): void {
	const binding = roomBindings.get( roomName );
	if ( ! binding ) {
		return;
	}

	cleanupBinding( binding );
	roomBindings.delete( roomName );

	ws.send( serializeControlMessage( { type: 'room:left', room: roomName } ) );

	// eslint-disable-next-line no-console
	console.log( `[mux-handler] Client left room: ${ roomName }` );
}

// ── Binary messages ─────────────────────────────────────────────

function handleBinaryMessage(
	ws: WebSocket,
	data: Buffer,
	roomBindings: Map< string, RoomBinding >
): void {
	try {
		const { room, payload } = decodeRoomMessage( new Uint8Array( data ) );
		const binding = roomBindings.get( room );

		if ( ! binding ) {
			// eslint-disable-next-line no-console
			console.warn( `[mux-handler] Binary message for unknown room: ${ room }` );
			return;
		}

		const decoder = decoding.createDecoder( payload );
		const messageType = decoding.readVarUint( decoder );

		switch ( messageType ) {
			case MESSAGE_SYNC:
				handleSyncMessage( ws, decoder, binding );
				break;

			case MESSAGE_AWARENESS:
				handleAwarenessMessage( decoder, binding );
				break;

			case MESSAGE_QUERY_AWARENESS:
				handleQueryAwareness( ws, binding );
				break;

			default:
				// eslint-disable-next-line no-console
				console.warn( `[mux-handler] Unknown message type: ${ messageType }` );
		}
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.error( '[mux-handler] Failed to process binary message:', error );
	}
}

function handleSyncMessage( ws: WebSocket, decoder: decoding.Decoder, binding: RoomBinding ): void {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint( encoder, MESSAGE_SYNC );

	// Use the per-subscriber origin so this subscriber's docUpdateHandler
	// skips the echo, while other subscribers' handlers relay it.
	/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- lib0 version mismatch */
	syncProtocol.readSyncMessage( decoder as any, encoder as any, binding.doc, binding.origin );
	/* eslint-enable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */

	// If readSyncMessage produced a response, send it back to this client.
	if ( encoding.length( encoder ) > 1 ) {
		ws.send( encodeRoomMessage( binding.roomName, encoding.toUint8Array( encoder ) ) );
	}
}

function handleAwarenessMessage( decoder: decoding.Decoder, binding: RoomBinding ): void {
	const update = decoding.readVarUint8Array( decoder );
	applyAwarenessUpdate( binding.awareness, update, binding.origin );

	// Track the client's awareness clientId from the first awareness update.
	// The awareness update wire format: varuint(count), then per entry:
	// varuint(clientId), varuint(clock), varString(state-json).
	// We extract the first clientId to use for cleanup on disconnect.
	if ( binding.subscriber.clientId === 0 && update.byteLength > 0 ) {
		try {
			const updateDecoder = decoding.createDecoder( update );
			const count = decoding.readVarUint( updateDecoder );
			if ( count > 0 ) {
				binding.subscriber.clientId = decoding.readVarUint( updateDecoder );
			}
		} catch {
			// Malformed update — ignore, clientId stays 0.
		}
	}
}

function handleQueryAwareness( ws: WebSocket, binding: RoomBinding ): void {
	const states = binding.awareness.getStates();
	if ( states.size === 0 ) {
		return;
	}

	const encoder = encoding.createEncoder();
	encoding.writeVarUint( encoder, MESSAGE_AWARENESS );
	encoding.writeVarUint8Array(
		encoder,
		encodeAwarenessUpdate( binding.awareness, Array.from( states.keys() ) )
	);
	ws.send( encodeRoomMessage( binding.roomName, encoding.toUint8Array( encoder ) ) );
}

// ── Cleanup ─────────────────────────────────────────────────────

function cleanupBinding( binding: RoomBinding ): void {
	// Remove awareness state for this client (skip if clientId was never captured).
	if ( binding.subscriber.clientId !== 0 ) {
		removeAwarenessStates( binding.awareness, [ binding.subscriber.clientId ], MUX_CLEANUP_ORIGIN );
	}

	// Detach listeners.
	binding.doc.off( 'update', binding.docUpdateHandler );
	binding.awareness.off( 'update', binding.awarenessUpdateHandler );

	// Unsubscribe from the room registry.
	unsubscribe( binding.roomName, binding.subscriber );
}
