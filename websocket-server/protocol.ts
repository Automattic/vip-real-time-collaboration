/**
 * Binary wire protocol for multiplexing multiple sync rooms over a single
 * WebSocket connection.
 *
 * This module is shared between the WebSocket server and the editor client.
 * It lives in `websocket-server/` (rather than a top-level shared directory)
 * because the server's Docker build context is limited to this directory; the
 * client bundles it via a relative import.
 *
 * Every WebSocket message contains exactly one protocol message:
 *
 *     [varuint version][varuint messageType][...fields]
 *
 * Field encodings:
 * - varuint: little-endian base-128 (LEB128), at most 5 bytes, values up to
 *   2^32 - 1.
 * - string: [varuint byteLength][UTF-8 bytes].
 *
 * Message layouts (after the version and messageType header):
 * - subscribe:   [string room][string grant]
 * - subscribed:  [string room]
 * - data:        [string room][remaining bytes = payload]
 * - unsubscribe: [string room]
 * - room_closed: [string room][varuint closeCode (4000–4999)]
 *
 * The `data` payload is an unmodified y-protocol message (sync or awareness),
 * which self-describes its own message type; this envelope only adds room
 * routing around it.
 *
 * Decoding is strict: unknown message types, unsupported versions, truncated
 * or trailing bytes, invalid UTF-8, and oversized fields are all rejected
 * with a typed {@link ProtocolError}. Room close codes remain numeric so the
 * transport codec does not own client retry or modal policy.
 */

import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as string from 'lib0/string';

export const MULTIPLEX_SUBPROTOCOL = 'vip-rtc-multiplex-v1';
export const PROTOCOL_VERSION = 1;

/**
 * Maximum encoded byte length of a room name. Current room names look like
 * `site-{blogId}/{objectType}-{objectId}` and stay well under 100 bytes;
 * anything near this limit indicates a hostile or corrupted message.
 */
export const MAX_ROOM_NAME_BYTES = 512;

/**
 * Maximum encoded byte length of an authorization grant (a JWT). Tokens are
 * typically well under 1 KiB; the limit only bounds hostile input.
 */
export const MAX_GRANT_BYTES = 8192;

const MIN_PRIVATE_ROOM_CLOSE_CODE = 4000;
const MAX_PRIVATE_ROOM_CLOSE_CODE = 4999;

export type ProtocolMessage =
	| { type: 'subscribe'; room: string; grant: string }
	| { type: 'subscribed'; room: string }
	| {
			type: 'data';
			room: string;
			/** Decoded payloads view the input buffer; copy before mutation or when independent ownership is required. */
			payload: Uint8Array;
	  }
	| { type: 'unsubscribe'; room: string }
	| { type: 'room_closed'; room: string; code: number };

// Stable wire identifiers. Do not renumber or reuse existing values; doing so
// would break compatibility with already-deployed peers.
const MESSAGE_TYPE_TO_WIRE_ID = {
	subscribe: 0,
	subscribed: 1,
	data: 2,
	unsubscribe: 3,
	room_closed: 4,
} as const satisfies Record< ProtocolMessage[ 'type' ], number >;
const KNOWN_WIRE_IDS = new Set< number >( Object.values( MESSAGE_TYPE_TO_WIRE_ID ) );

export type ProtocolErrorReason =
	| 'truncated'
	| 'trailing_data'
	| 'unsupported_version'
	| 'unknown_message_type'
	| 'varuint_too_large'
	| 'invalid_string'
	| 'empty_room'
	| 'room_too_long'
	| 'empty_grant'
	| 'grant_too_long'
	| 'empty_payload'
	| 'invalid_close_code';

export class ProtocolError extends Error {
	public constructor(
		public readonly reason: ProtocolErrorReason,
		message: string
	) {
		super( message );
		this.name = 'ProtocolError';
	}
}

function writeString(
	encoder: encoding.Encoder,
	value: string,
	maxBytes: number,
	tooLongReason: ProtocolErrorReason
): void {
	const encoded = string.encodeUtf8( value );
	if ( encoded.length > maxBytes ) {
		throw new ProtocolError(
			tooLongReason,
			`String of ${ encoded.length } bytes exceeds limit of ${ maxBytes }`
		);
	}
	encoding.writeVarUint( encoder, encoded.length );
	encoding.writeUint8Array( encoder, encoded );
}

function validateRoom( room: string ): void {
	if ( room.length === 0 ) {
		throw new ProtocolError( 'empty_room', 'Room name must not be empty' );
	}
}

function validateRoomCloseCode( code: number ): void {
	if (
		! Number.isInteger( code ) ||
		code < MIN_PRIVATE_ROOM_CLOSE_CODE ||
		code > MAX_PRIVATE_ROOM_CLOSE_CODE
	) {
		throw new ProtocolError(
			'invalid_close_code',
			`Room close code must be between ${ MIN_PRIVATE_ROOM_CLOSE_CODE } and ${ MAX_PRIVATE_ROOM_CLOSE_CODE }: ${ code }`
		);
	}
}

/**
 * Strict, bounds-checked reader over an incoming message. Every read throws a
 * typed ProtocolError instead of returning garbage on malformed input.
 */
class Reader {
	private readonly decoder: decoding.Decoder;

	public constructor( data: Uint8Array ) {
		this.decoder = decoding.createDecoder( data );
	}

	public readVarUint(): number {
		let value = 0;
		for ( let byteIndex = 0; byteIndex < 5; byteIndex += 1 ) {
			const byte = this.decoder.arr[ this.decoder.pos ];
			if ( byte === undefined ) {
				throw new ProtocolError( 'truncated', 'Message ended inside a varuint' );
			}

			// A 32-bit varuint may use only the low four bits of its fifth byte.
			// lib0 supports larger integers, so keep the protocol's narrower bound.
			if ( byteIndex === 4 ) {
				if ( byte >= 0x80 ) {
					throw new ProtocolError( 'varuint_too_large', 'Varuint uses more than 5 bytes' );
				}
				if ( byte > 0x0f ) {
					throw new ProtocolError( 'varuint_too_large', 'Varuint exceeds 32-bit range' );
				}
			}

			this.decoder.pos += 1;
			value += ( byte % 0x80 ) * 2 ** ( byteIndex * 7 );
			if ( byte < 0x80 ) {
				return value;
			}
		}

		throw new ProtocolError( 'varuint_too_large', 'Varuint uses more than 5 bytes' );
	}

	public readString( maxBytes: number, tooLongReason: ProtocolErrorReason ): string {
		const length = this.readVarUint();
		if ( length > maxBytes ) {
			throw new ProtocolError(
				tooLongReason,
				`String of ${ length } bytes exceeds limit of ${ maxBytes }`
			);
		}
		if ( this.decoder.pos + length > this.decoder.arr.length ) {
			throw new ProtocolError( 'truncated', 'Message ended inside a string' );
		}

		const bytes = decoding.readUint8Array( this.decoder, length );

		try {
			return string.decodeUtf8( bytes );
		} catch {
			throw new ProtocolError( 'invalid_string', 'String is not valid UTF-8' );
		}
	}

	public readTail(): Uint8Array {
		return decoding.readTailAsUint8Array( this.decoder );
	}

	/** Reject messages with unexpected bytes after the last field. */
	public assertDone(): void {
		if ( decoding.hasContent( this.decoder ) ) {
			throw new ProtocolError(
				'trailing_data',
				`Message has ${ this.decoder.arr.length - this.decoder.pos } trailing bytes`
			);
		}
	}
}

/**
 * Report a message whose `type` is outside the known union. Only an untyped
 * (JS) caller can reach this; the `never` parameter turns an unhandled new
 * message type into a compile-time error at the call site.
 */
function unknownMessageType( message: never ): ProtocolError {
	return new ProtocolError(
		'unknown_message_type',
		`Unknown message type: ${ String( ( message as { type?: unknown } ).type ) }`
	);
}

/**
 * Encode a protocol message into a binary WebSocket message.
 *
 * @throws {ProtocolError} When a field is empty, oversized, or out of range.
 */
export function encodeMessage( message: ProtocolMessage ): Uint8Array {
	const messageType = message.type;
	if ( ! Object.prototype.hasOwnProperty.call( MESSAGE_TYPE_TO_WIRE_ID, messageType ) ) {
		throw unknownMessageType( message as never );
	}
	const wireType = MESSAGE_TYPE_TO_WIRE_ID[ messageType ];

	validateRoom( message.room );
	const encoder = encoding.createEncoder();
	encoding.writeVarUint( encoder, PROTOCOL_VERSION );
	encoding.writeVarUint( encoder, wireType );
	writeString( encoder, message.room, MAX_ROOM_NAME_BYTES, 'room_too_long' );

	switch ( messageType ) {
		case 'subscribe': {
			if ( message.grant.length === 0 ) {
				throw new ProtocolError( 'empty_grant', 'Grant must not be empty' );
			}
			writeString( encoder, message.grant, MAX_GRANT_BYTES, 'grant_too_long' );
			break;
		}

		case 'subscribed':
		case 'unsubscribe':
			break;

		case 'data': {
			if ( message.payload.length === 0 ) {
				throw new ProtocolError( 'empty_payload', 'Data payload must not be empty' );
			}
			encoding.writeUint8Array( encoder, message.payload );
			break;
		}

		case 'room_closed': {
			validateRoomCloseCode( message.code );
			encoding.writeVarUint( encoder, message.code );
			break;
		}

		default:
			throw unknownMessageType( message );
	}

	return encoding.toUint8Array( encoder );
}

/**
 * Decode a binary WebSocket message into a protocol message.
 *
 * @throws {ProtocolError} When the message is malformed, truncated, oversized,
 *                         of an unsupported version, or of an unknown type.
 */
export function decodeMessage( data: Uint8Array ): ProtocolMessage {
	const reader = new Reader( data );

	const version = reader.readVarUint();
	if ( version !== PROTOCOL_VERSION ) {
		throw new ProtocolError( 'unsupported_version', `Unsupported protocol version: ${ version }` );
	}

	// Reject unknown types before parsing fields, so messages from newer
	// protocol revisions fail with a clear reason instead of a misleading
	// parse error from assuming today's field layout.
	const wireType = reader.readVarUint();
	if ( ! KNOWN_WIRE_IDS.has( wireType ) ) {
		throw new ProtocolError( 'unknown_message_type', `Unknown message type: ${ wireType }` );
	}

	const room = reader.readString( MAX_ROOM_NAME_BYTES, 'room_too_long' );
	validateRoom( room );

	switch ( wireType ) {
		case MESSAGE_TYPE_TO_WIRE_ID.subscribe: {
			const grant = reader.readString( MAX_GRANT_BYTES, 'grant_too_long' );
			if ( grant.length === 0 ) {
				throw new ProtocolError( 'empty_grant', 'Grant must not be empty' );
			}
			reader.assertDone();
			return { type: 'subscribe', room, grant };
		}

		case MESSAGE_TYPE_TO_WIRE_ID.subscribed: {
			reader.assertDone();
			return { type: 'subscribed', room };
		}

		case MESSAGE_TYPE_TO_WIRE_ID.data: {
			const payload = reader.readTail();
			if ( payload.length === 0 ) {
				throw new ProtocolError( 'empty_payload', 'Data payload must not be empty' );
			}
			return { type: 'data', room, payload };
		}

		case MESSAGE_TYPE_TO_WIRE_ID.unsubscribe: {
			reader.assertDone();
			return { type: 'unsubscribe', room };
		}

		case MESSAGE_TYPE_TO_WIRE_ID.room_closed: {
			const code = reader.readVarUint();
			validateRoomCloseCode( code );
			reader.assertDone();
			return { type: 'room_closed', room, code };
		}

		default:
			// Unreachable: wireType is range-checked above.
			throw new ProtocolError( 'unknown_message_type', `Unknown message type: ${ wireType }` );
	}
}
