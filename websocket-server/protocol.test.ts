import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
	decodeMessage,
	encodeMessage,
	MAX_GRANT_BYTES,
	MAX_ROOM_NAME_BYTES,
	MULTIPLEX_SUBPROTOCOL,
	PROTOCOL_VERSION,
	ProtocolError,
	type DataMessage,
	type ProtocolMessage,
	type ProtocolErrorReason,
} from './protocol';

const ROOM = 'site-1/postType/post-123';
const GRANT = 'header.payload.signature';

describe( 'protocol constants', () => {
	it( 'exports protocol version 1', () => {
		assert.strictEqual( PROTOCOL_VERSION, 1 );
	} );

	it( 'exports the multiplex WebSocket subprotocol', () => {
		assert.strictEqual( MULTIPLEX_SUBPROTOCOL, 'vip-rtc-multiplex-v1' );
	} );
} );

/**
 * Build a raw message by hand so tests can craft malformed input the encoder
 * refuses to produce. Values must stay under 128 so every varuint is a
 * single byte; use rawVarUint() for larger values.
 */
function wireMessage( ...parts: Array< number | string | number[] > ): Uint8Array {
	const bytes: number[] = [];
	for ( const part of parts ) {
		if ( typeof part === 'number' ) {
			assert.ok( part < 0x80, 'wireMessage() only supports single-byte varuints' );
			bytes.push( part );
		} else if ( typeof part === 'string' ) {
			const encoded = Array.from( new TextEncoder().encode( part ) );
			assert.ok( encoded.length < 0x80 );
			bytes.push( encoded.length, ...encoded );
		} else {
			bytes.push( ...part );
		}
	}
	return Uint8Array.from( bytes );
}

function rawVarUint( value: number ): number[] {
	const bytes: number[] = [];
	while ( value > 0x7f ) {
		bytes.push( 0x80 + ( value % 0x80 ) );
		value = Math.floor( value / 0x80 );
	}
	bytes.push( value );
	return bytes;
}

function assertProtocolError(
	fn: () => unknown,
	reason: ProtocolErrorReason,
	messagePattern?: RegExp
): void {
	assert.throws( fn, ( error: unknown ) => {
		assert.ok( error instanceof ProtocolError, 'expected a ProtocolError' );
		assert.strictEqual( error.reason, reason );
		if ( messagePattern ) {
			assert.match( error.message, messagePattern );
		}
		return true;
	} );
}

// A typed assertion so tests can read DataMessage fields without a cast; it
// both checks the discriminant at runtime and narrows the type for TypeScript.
function assertDataMessage( message: ProtocolMessage ): asserts message is DataMessage {
	assert.strictEqual( message.type, 'data' );
}

describe( 'round-trips', () => {
	it( 'subscribe', () => {
		const decoded = decodeMessage(
			encodeMessage( { type: 'subscribe', room: ROOM, grant: GRANT } )
		);
		assert.deepStrictEqual( decoded, {
			type: 'subscribe',
			room: ROOM,
			grant: GRANT,
		} );
	} );

	it( 'subscribed', () => {
		const decoded = decodeMessage( encodeMessage( { type: 'subscribed', room: ROOM } ) );
		assert.deepStrictEqual( decoded, { type: 'subscribed', room: ROOM } );
	} );

	it( 'unsubscribe', () => {
		const decoded = decodeMessage( encodeMessage( { type: 'unsubscribe', room: ROOM } ) );
		assert.deepStrictEqual( decoded, { type: 'unsubscribe', room: ROOM } );
	} );

	it( 'data with a binary payload', () => {
		// Cover every byte value, including 0x00 and high bytes, so the
		// payload cannot be confused with envelope fields.
		const payload = Uint8Array.from(
			Array.from( { length: 256 }, ( _unusedValue, index ) => index )
		);
		const decoded = decodeMessage( encodeMessage( { type: 'data', room: ROOM, payload } ) );
		assertDataMessage( decoded );
		assert.strictEqual( decoded.room, ROOM );
		assert.deepStrictEqual( Array.from( decoded.payload ), Array.from( payload ) );
	} );

	it( 'data payload of a single byte', () => {
		const decoded = decodeMessage(
			encodeMessage( {
				type: 'data',
				room: ROOM,
				payload: Uint8Array.from( [ 0 ] ),
			} )
		);
		assertDataMessage( decoded );
		assert.deepStrictEqual( Array.from( decoded.payload ), [ 0 ] );
	} );

	it( 'multibyte UTF-8 room names', () => {
		const room = 'site-1/postType/pöst-✏️-123';
		const decoded = decodeMessage( encodeMessage( { type: 'subscribed', room } ) );
		assert.deepStrictEqual( decoded, { type: 'subscribed', room } );
	} );

	it( 'room_closed with a numeric close code', () => {
		const decoded = decodeMessage(
			encodeMessage( { type: 'room_closed', room: ROOM, code: 4004 } )
		);
		assert.deepStrictEqual( decoded, {
			type: 'room_closed',
			room: ROOM,
			code: 4004,
		} );
	} );

	it( 'preserves an unrecognized numeric close code', () => {
		const decoded = decodeMessage(
			encodeMessage( { type: 'room_closed', room: ROOM, code: 4999 } )
		);
		assert.deepStrictEqual( decoded, {
			type: 'room_closed',
			room: ROOM,
			code: 4999,
		} );
	} );

	it( 'room name at exactly the byte limit', () => {
		const room = 'r'.repeat( MAX_ROOM_NAME_BYTES );
		const decoded = decodeMessage( encodeMessage( { type: 'subscribed', room } ) );
		assert.strictEqual( decoded.room, room );
	} );
} );

describe( 'wire format stability', () => {
	// If these fail, the change breaks decoding for already-deployed peers.
	const fixtures: Array< {
		name: string;
		message: ProtocolMessage;
		bytes: number[];
	} > = [
		{
			name: 'subscribe',
			message: { type: 'subscribe', room: 'a', grant: 'b' },
			bytes: [ 1, 0, 1, 0x61, 1, 0x62 ],
		},
		{
			name: 'subscribed',
			message: { type: 'subscribed', room: 'a' },
			bytes: [ 1, 1, 1, 0x61 ],
		},
		{
			name: 'data',
			message: { type: 'data', room: 'a', payload: Uint8Array.from( [ 0, 0xff ] ) },
			bytes: [ 1, 2, 1, 0x61, 0, 0xff ],
		},
		{
			name: 'unsubscribe',
			message: { type: 'unsubscribe', room: 'a' },
			bytes: [ 1, 3, 1, 0x61 ],
		},
		{
			name: 'room_closed',
			message: { type: 'room_closed', room: 'a', code: 4004 },
			// code=4004 as a varuint
			bytes: [ 1, 4, 1, 0x61, 0xa4, 0x1f ],
		},
	];

	for ( const { name, message, bytes } of fixtures ) {
		it( `encodes ${ name } with the documented byte layout`, () => {
			assert.deepStrictEqual( Array.from( encodeMessage( message ) ), bytes );
		} );
	}
} );

describe( 'encode validation', () => {
	it( 'rejects an unknown message type at runtime', () => {
		const invalidMessage = { type: 'future' } as unknown as ProtocolMessage;
		assertProtocolError( () => encodeMessage( invalidMessage ), 'unknown_message_type' );
	} );

	it( 'rejects an empty room name', () => {
		assertProtocolError( () => encodeMessage( { type: 'subscribed', room: '' } ), 'empty_room' );
	} );

	it( 'rejects an oversized room name, measured in bytes', () => {
		// 200 four-byte emoji = 800 bytes from only 400 UTF-16 code units.
		const room = '🚀'.repeat( 200 );
		assertProtocolError( () => encodeMessage( { type: 'subscribed', room } ), 'room_too_long' );
	} );

	it( 'rejects a room name one byte over the limit', () => {
		const room = 'r'.repeat( MAX_ROOM_NAME_BYTES + 1 );
		assertProtocolError( () => encodeMessage( { type: 'subscribed', room } ), 'room_too_long' );
	} );

	it( 'rejects an empty grant', () => {
		assertProtocolError(
			() => encodeMessage( { type: 'subscribe', room: ROOM, grant: '' } ),
			'empty_grant'
		);
	} );

	it( 'rejects an oversized grant', () => {
		const grant = 'g'.repeat( MAX_GRANT_BYTES + 1 );
		assertProtocolError(
			() => encodeMessage( { type: 'subscribe', room: ROOM, grant } ),
			'grant_too_long'
		);
	} );

	it( 'rejects an empty data payload', () => {
		assertProtocolError(
			() =>
				encodeMessage( {
					type: 'data',
					room: ROOM,
					payload: new Uint8Array( 0 ),
				} ),
			'empty_payload'
		);
	} );

	it( 'rejects invalid room close codes', () => {
		for ( const code of [ -1, 0, 1.5, NaN, 3999, 5000, 2 ** 32 ] ) {
			assertProtocolError(
				() =>
					encodeMessage( {
						type: 'room_closed',
						room: ROOM,
						code,
					} ),
				'invalid_close_code'
			);
		}
	} );
} );

describe( 'decode validation', () => {
	const TYPE_SUBSCRIBE = 0;
	const TYPE_SUBSCRIBED = 1;
	const TYPE_DATA = 2;
	const TYPE_UNSUBSCRIBE = 3;
	const TYPE_ROOM_CLOSED = 4;

	it( 'rejects an empty message', () => {
		assertProtocolError( () => decodeMessage( new Uint8Array( 0 ) ), 'truncated' );
	} );

	it( 'rejects a message with only a version', () => {
		assertProtocolError( () => decodeMessage( wireMessage( PROTOCOL_VERSION ) ), 'truncated' );
	} );

	for ( const version of [ 0, PROTOCOL_VERSION + 1 ] ) {
		it( `rejects unsupported version ${ version }`, () => {
			assertProtocolError(
				() => decodeMessage( wireMessage( version, TYPE_SUBSCRIBED, 'a' ) ),
				'unsupported_version'
			);
		} );
	}

	it( 'rejects an unknown message type before parsing fields', () => {
		assertProtocolError(
			() => decodeMessage( wireMessage( PROTOCOL_VERSION, 99 ) ),
			'unknown_message_type'
		);
	} );

	it( 'rejects a truncated string length', () => {
		// Declares a 10-byte room but provides only 3 bytes.
		assertProtocolError(
			() =>
				decodeMessage( wireMessage( PROTOCOL_VERSION, TYPE_SUBSCRIBED, [ 10, 0x61, 0x62, 0x63 ] ) ),
			'truncated'
		);
	} );

	it( 'rejects an oversized room name without allocating it', () => {
		assertProtocolError(
			() =>
				decodeMessage(
					wireMessage( PROTOCOL_VERSION, TYPE_SUBSCRIBED, rawVarUint( MAX_ROOM_NAME_BYTES + 1 ) )
				),
			'room_too_long'
		);
	} );

	it( 'rejects an oversized grant', () => {
		assertProtocolError(
			() =>
				decodeMessage(
					wireMessage( PROTOCOL_VERSION, TYPE_SUBSCRIBE, 'a', rawVarUint( MAX_GRANT_BYTES + 1 ) )
				),
			'grant_too_long'
		);
	} );

	it( 'rejects an empty room name', () => {
		assertProtocolError(
			() => decodeMessage( wireMessage( PROTOCOL_VERSION, TYPE_SUBSCRIBED, '' ) ),
			'empty_room'
		);
	} );

	it( 'rejects an empty grant', () => {
		assertProtocolError(
			() => decodeMessage( wireMessage( PROTOCOL_VERSION, TYPE_SUBSCRIBE, 'a', '' ) ),
			'empty_grant'
		);
	} );

	it( 'rejects invalid UTF-8 in a room name', () => {
		assertProtocolError(
			() => decodeMessage( wireMessage( PROTOCOL_VERSION, TYPE_SUBSCRIBED, [ 2, 0xff, 0xfe ] ) ),
			'invalid_string'
		);
	} );

	const fixedShapeMessages: Array< { name: string; fields: Array< number | string | number[] > } > =
		[
			{ name: 'subscribe', fields: [ TYPE_SUBSCRIBE, 'a', 'grant' ] },
			{ name: 'subscribed', fields: [ TYPE_SUBSCRIBED, 'a' ] },
			{ name: 'unsubscribe', fields: [ TYPE_UNSUBSCRIBE, 'a' ] },
		];

	for ( const { name, fields } of fixedShapeMessages ) {
		it( `rejects trailing bytes after ${ name }`, () => {
			assertProtocolError(
				() => decodeMessage( wireMessage( PROTOCOL_VERSION, ...fields, [ 0x00 ] ) ),
				'trailing_data'
			);
		} );
	}

	it( 'rejects an empty data payload', () => {
		assertProtocolError(
			() => decodeMessage( wireMessage( PROTOCOL_VERSION, TYPE_DATA, 'a' ) ),
			'empty_payload'
		);
	} );

	it( 'rejects trailing bytes after a room close code', () => {
		assertProtocolError(
			() =>
				decodeMessage(
					wireMessage( PROTOCOL_VERSION, TYPE_ROOM_CLOSED, 'a', rawVarUint( 4004 ), 0 )
				),
			'trailing_data'
		);
	} );

	it( 'rejects a truncated room_closed', () => {
		assertProtocolError(
			() => decodeMessage( wireMessage( PROTOCOL_VERSION, TYPE_ROOM_CLOSED, 'a' ) ),
			'truncated'
		);
	} );

	it( 'rejects room close codes outside the private-use range', () => {
		for ( const code of [ 0, 3999, 5000 ] ) {
			assertProtocolError(
				() =>
					decodeMessage(
						wireMessage( PROTOCOL_VERSION, TYPE_ROOM_CLOSED, 'a', rawVarUint( code ) )
					),
				'invalid_close_code'
			);
		}
	} );

	it( 'rejects a varuint longer than 5 bytes', () => {
		assertProtocolError(
			() => decodeMessage( Uint8Array.from( [ 0x80, 0x80, 0x80, 0x80, 0x80, 0x01 ] ) ),
			'varuint_too_large',
			/more than 5 bytes/
		);
	} );

	it( 'rejects a 5-byte varuint above the 32-bit range', () => {
		assertProtocolError(
			() => decodeMessage( Uint8Array.from( [ 0xff, 0xff, 0xff, 0xff, 0x10 ] ) ),
			'varuint_too_large',
			/32-bit range/
		);
	} );

	it( 'accepts the maximum 32-bit varuint before semantic validation', () => {
		assertProtocolError(
			() => decodeMessage( Uint8Array.from( [ 0xff, 0xff, 0xff, 0xff, 0x0f ] ) ),
			'unsupported_version',
			/4294967295/
		);
	} );

	it( 'decodes an unrecognized room close code as its numeric value', () => {
		const decoded = decodeMessage(
			wireMessage( PROTOCOL_VERSION, TYPE_ROOM_CLOSED, 'a', rawVarUint( 4999 ) )
		);
		assert.deepStrictEqual( decoded, {
			type: 'room_closed',
			room: 'a',
			code: 4999,
		} );
	} );
} );

describe( 'exhaustiveness', () => {
	it( 'every encodable message type round-trips', () => {
		const messages: ProtocolMessage[] = [
			{ type: 'subscribe', room: ROOM, grant: GRANT },
			{ type: 'subscribed', room: ROOM },
			{ type: 'data', room: ROOM, payload: Uint8Array.from( [ 1, 2 ] ) },
			{ type: 'unsubscribe', room: ROOM },
			{ type: 'room_closed', room: ROOM, code: 4004 },
		];

		for ( const message of messages ) {
			const decoded = decodeMessage( encodeMessage( message ) );
			assert.strictEqual( decoded.type, message.type );
			assert.strictEqual( decoded.room, message.room );
		}
	} );
} );
