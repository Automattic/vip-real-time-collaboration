/**
 * Multiplexing Protocol — Server Side
 *
 * Mirror of the client-side mux-protocol. Defines the same wire format
 * for room-prefixed binary frames and JSON control messages.
 */
// eslint-disable-next-line import/no-extraneous-dependencies -- lib0 is a transitive dependency via y-protocols
import * as decoding from 'lib0/decoding';
// eslint-disable-next-line import/no-extraneous-dependencies -- lib0 is a transitive dependency via y-protocols
import * as encoding from 'lib0/encoding';

/**
 * y-protocols message type constants.
 */
export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;
export const MESSAGE_QUERY_AWARENESS = 3;

/**
 * Control message types sent/received as JSON text frames.
 */
export type ControlMessage =
	| { type: 'room:join'; room: string; auth: string }
	| { type: 'room:joined'; room: string }
	| { type: 'room:leave'; room: string }
	| { type: 'room:left'; room: string }
	| { type: 'room:error'; room: string; code: number; message: string }
	| { type: 'error'; code: number; message: string };

/**
 * Encode a binary frame with room name prefix.
 */
export function encodeRoomMessage( room: string, payload: Uint8Array ): Uint8Array {
	const encoder = encoding.createEncoder();
	encoding.writeVarString( encoder, room );
	encoding.writeVarUint8Array( encoder, payload );
	return encoding.toUint8Array( encoder );
}

/**
 * Decode a binary frame, extracting the room name and payload.
 */
export function decodeRoomMessage( data: Uint8Array ): { room: string; payload: Uint8Array } {
	const decoder = decoding.createDecoder( data );
	const room = decoding.readVarString( decoder );
	const payload = decoding.readVarUint8Array( decoder );
	return { room, payload };
}

/**
 * Parse a JSON text frame into a ControlMessage.
 * Validates field types to prevent malformed messages from propagating.
 */
export function parseControlMessage( data: string ): ControlMessage | null {
	try {
		const parsed: unknown = JSON.parse( data );
		if ( typeof parsed !== 'object' || parsed === null || ! ( 'type' in parsed ) ) {
			return null;
		}

		const msg = parsed as Record< string, unknown >;

		switch ( msg.type ) {
			case 'room:join':
				if ( typeof msg.room === 'string' && typeof msg.auth === 'string' ) {
					return { type: 'room:join', room: msg.room, auth: msg.auth };
				}
				return null;

			case 'room:joined':
			case 'room:leave':
			case 'room:left':
				if ( typeof msg.room === 'string' ) {
					return { type: msg.type, room: msg.room };
				}
				return null;

			case 'room:error':
				if (
					typeof msg.room === 'string' &&
					typeof msg.code === 'number' &&
					typeof msg.message === 'string'
				) {
					return { type: 'room:error', room: msg.room, code: msg.code, message: msg.message };
				}
				return null;

			case 'error':
				if ( typeof msg.code === 'number' && typeof msg.message === 'string' ) {
					return { type: 'error', code: msg.code, message: msg.message };
				}
				return null;

			default:
				return null;
		}
	} catch {
		// Not JSON — ignore.
	}
	return null;
}

/**
 * Serialize a ControlMessage to a JSON string.
 */
export function serializeControlMessage( msg: ControlMessage ): string {
	return JSON.stringify( msg );
}
