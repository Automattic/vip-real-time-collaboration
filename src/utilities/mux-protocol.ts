/**
 * Multiplexing Protocol — Client Side
 *
 * Defines the wire format for multiplexing multiple Y.js rooms over a single
 * WebSocket connection:
 *
 *   Binary frames (y-protocols data):
 *     [roomNameLen: varUint][roomName: UTF-8][y-protocols message bytes]
 *
 *   Text frames (control messages):
 *     JSON objects with a `type` field discriminator.
 *
 * The binary framing uses lib0's varUint encoding for the room name length,
 * keeping it consistent with the rest of the y-protocols stack.
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
 *
 * @param room    The room name this message belongs to.
 * @param payload The y-protocols message bytes (messageType + payload).
 * @return The framed binary message.
 */
export function encodeRoomMessage( room: string, payload: Uint8Array ): Uint8Array {
	const encoder = encoding.createEncoder();
	encoding.writeVarString( encoder, room );
	encoding.writeVarUint8Array( encoder, payload );
	return encoding.toUint8Array( encoder );
}

/**
 * Decode a binary frame, extracting the room name and payload.
 *
 * @param data The framed binary message.
 * @return An object with the room name and the y-protocols payload bytes.
 */
export function decodeRoomMessage( data: Uint8Array ): { room: string; payload: Uint8Array } {
	const decoder = decoding.createDecoder( data );
	const room = decoding.readVarString( decoder );
	const payload = decoding.readVarUint8Array( decoder );
	return { room, payload };
}

/**
 * Parse a JSON text frame into a ControlMessage.
 * Returns null if the data is not a valid control message.
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
 * Serialize a ControlMessage to a JSON string for sending as a text frame.
 */
export function serializeControlMessage( msg: ControlMessage ): string {
	return JSON.stringify( msg );
}
