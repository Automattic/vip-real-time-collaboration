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

const MAX_VARUINT = 0xffffffff;
const MIN_PRIVATE_ROOM_CLOSE_CODE = 4000;
const MAX_PRIVATE_ROOM_CLOSE_CODE = 4999;

// Stable wire identifiers. Do not renumber or reuse existing values; doing so
// would break compatibility with already-deployed peers.
const WIRE_TYPE_SUBSCRIBE = 0;
const WIRE_TYPE_SUBSCRIBED = 1;
const WIRE_TYPE_DATA = 2;
const WIRE_TYPE_UNSUBSCRIBE = 3;
const WIRE_TYPE_ROOM_CLOSED = 4;

export interface SubscribeMessage {
	type: 'subscribe';
	room: string;
	grant: string;
}

export interface SubscribedMessage {
	type: 'subscribed';
	room: string;
}

export interface DataMessage {
	type: 'data';
	room: string;
	/** Decoded payloads view the input buffer; copy before mutation or when independent ownership is required. */
	payload: Uint8Array;
}

export interface UnsubscribeMessage {
	type: 'unsubscribe';
	room: string;
}

export interface RoomClosedMessage {
	type: 'room_closed';
	room: string;
	code: number;
}

export type ProtocolMessage =
	| SubscribeMessage
	| SubscribedMessage
	| DataMessage
	| UnsubscribeMessage
	| RoomClosedMessage;

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

function writeVarUint( encoder: encoding.Encoder, value: number ): void {
	// Callers validate range; this guards internal misuse.
	if ( ! Number.isInteger( value ) || value < 0 || value > MAX_VARUINT ) {
		throw new ProtocolError( 'varuint_too_large', `Cannot encode varuint: ${ value }` );
	}

	encoding.writeVarUint( encoder, value );
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
	writeVarUint( encoder, encoded.length );
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
		const start = this.decoder.pos;
		let byteIndex = 0;
		while ( true ) {
			const byte = this.decoder.arr[ start + byteIndex ];
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

			if ( byte < 0x80 ) {
				return decoding.readVarUint( this.decoder );
			}

			byteIndex += 1;
		}
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
function unknownMessageType( messageType: never ): ProtocolError {
	return new ProtocolError(
		'unknown_message_type',
		`Unknown message type: ${ String( messageType ) }`
	);
}

/**
 * Encode a protocol message into a binary WebSocket message.
 *
 * @throws {ProtocolError} When a field is empty, oversized, or out of range.
 */
export function encodeMessage( message: ProtocolMessage ): Uint8Array {
	const messageType = message.type;
	const encoder = encoding.createEncoder();
	writeVarUint( encoder, PROTOCOL_VERSION );

	switch ( messageType ) {
		case 'subscribe': {
			validateRoom( message.room );
			if ( message.grant.length === 0 ) {
				throw new ProtocolError( 'empty_grant', 'Grant must not be empty' );
			}
			writeVarUint( encoder, WIRE_TYPE_SUBSCRIBE );
			writeString( encoder, message.room, MAX_ROOM_NAME_BYTES, 'room_too_long' );
			writeString( encoder, message.grant, MAX_GRANT_BYTES, 'grant_too_long' );
			return encoding.toUint8Array( encoder );
		}

		case 'subscribed': {
			validateRoom( message.room );
			writeVarUint( encoder, WIRE_TYPE_SUBSCRIBED );
			writeString( encoder, message.room, MAX_ROOM_NAME_BYTES, 'room_too_long' );
			return encoding.toUint8Array( encoder );
		}

		case 'data': {
			validateRoom( message.room );
			if ( message.payload.length === 0 ) {
				throw new ProtocolError( 'empty_payload', 'Data payload must not be empty' );
			}
			writeVarUint( encoder, WIRE_TYPE_DATA );
			writeString( encoder, message.room, MAX_ROOM_NAME_BYTES, 'room_too_long' );
			encoding.writeUint8Array( encoder, message.payload );
			return encoding.toUint8Array( encoder );
		}

		case 'unsubscribe': {
			validateRoom( message.room );
			writeVarUint( encoder, WIRE_TYPE_UNSUBSCRIBE );
			writeString( encoder, message.room, MAX_ROOM_NAME_BYTES, 'room_too_long' );
			return encoding.toUint8Array( encoder );
		}

		case 'room_closed': {
			validateRoom( message.room );
			validateRoomCloseCode( message.code );
			writeVarUint( encoder, WIRE_TYPE_ROOM_CLOSED );
			writeString( encoder, message.room, MAX_ROOM_NAME_BYTES, 'room_too_long' );
			writeVarUint( encoder, message.code );
			return encoding.toUint8Array( encoder );
		}

		default:
			throw unknownMessageType( messageType );
	}
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
	if ( wireType < WIRE_TYPE_SUBSCRIBE || wireType > WIRE_TYPE_ROOM_CLOSED ) {
		throw new ProtocolError( 'unknown_message_type', `Unknown message type: ${ wireType }` );
	}

	const room = reader.readString( MAX_ROOM_NAME_BYTES, 'room_too_long' );
	validateRoom( room );

	switch ( wireType ) {
		case WIRE_TYPE_SUBSCRIBE: {
			const grant = reader.readString( MAX_GRANT_BYTES, 'grant_too_long' );
			if ( grant.length === 0 ) {
				throw new ProtocolError( 'empty_grant', 'Grant must not be empty' );
			}
			reader.assertDone();
			return { type: 'subscribe', room, grant };
		}

		case WIRE_TYPE_SUBSCRIBED: {
			reader.assertDone();
			return { type: 'subscribed', room };
		}

		case WIRE_TYPE_DATA: {
			const payload = reader.readTail();
			if ( payload.length === 0 ) {
				throw new ProtocolError( 'empty_payload', 'Data payload must not be empty' );
			}
			return { type: 'data', room, payload };
		}

		case WIRE_TYPE_UNSUBSCRIBE: {
			reader.assertDone();
			return { type: 'unsubscribe', room };
		}

		case WIRE_TYPE_ROOM_CLOSED: {
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
