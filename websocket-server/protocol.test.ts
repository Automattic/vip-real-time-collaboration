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
	type ProtocolErrorReason,
	type ProtocolMessage,
} from './protocol';

const ROOM = 'site-1/postType/post-123';

type CanonicalMessages = {
	[ Type in ProtocolMessage[ 'type' ] ]: {
		message: Extract< ProtocolMessage, { type: Type } >;
		bytes: number[];
	};
};

const CANONICAL_MESSAGES = {
	subscribe: {
		message: { type: 'subscribe', room: 'a', grant: 'b' },
		bytes: [ 1, 0, 1, 0x61, 1, 0x62 ],
	},
	subscribed: {
		message: { type: 'subscribed', room: 'a' },
		bytes: [ 1, 1, 1, 0x61 ],
	},
	data: {
		message: { type: 'data', room: 'a', payload: Uint8Array.from( [ 0, 0xff ] ) },
		bytes: [ 1, 2, 1, 0x61, 0, 0xff ],
	},
	unsubscribe: {
		message: { type: 'unsubscribe', room: 'a' },
		bytes: [ 1, 3, 1, 0x61 ],
	},
	room_closed: {
		message: { type: 'room_closed', room: 'a', code: 4004 },
		bytes: [ 1, 4, 1, 0x61, 0xa4, 0x1f ],
	},
} satisfies CanonicalMessages;

/**
 * Build raw frames the encoder intentionally refuses to produce. Numbers are
 * single-byte varuints; larger values use rawVarUint().
 */
function wireMessage( ...parts: Array< number | string | number[] > ): Uint8Array {
	const bytes: number[] = [];
	for ( const part of parts ) {
		if ( typeof part === 'number' ) {
			assert.ok( part < 0x80 );
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

function assertProtocolError( fn: () => unknown, reason: ProtocolErrorReason ): void {
	assert.throws( fn, ( error: unknown ) => {
		assert.ok( error instanceof ProtocolError );
		assert.strictEqual( error.reason, reason );
		return true;
	} );
}

describe( 'protocol wire contract', () => {
	it( 'keeps the deployed WebSocket subprotocol', () => {
		assert.strictEqual( MULTIPLEX_SUBPROTOCOL, 'vip-rtc-multiplex-v1' );
	} );

	for ( const [ name, { message, bytes } ] of Object.entries( CANONICAL_MESSAGES ) ) {
		it( `round-trips ${ name } with its exact deployed bytes`, () => {
			const encoded = encodeMessage( message );
			assert.deepStrictEqual( Array.from( encoded ), bytes );
			assert.deepStrictEqual( decodeMessage( encoded ), message );
		} );
	}

	it( 'round-trips multibyte and maximum-size fields', () => {
		const room = `${ '🚀'.repeat( 127 ) }room`;
		assert.strictEqual( new TextEncoder().encode( room ).length, MAX_ROOM_NAME_BYTES );
		const message = {
			type: 'subscribe' as const,
			room,
			grant: 'g'.repeat( MAX_GRANT_BYTES ),
		};

		assert.deepStrictEqual( decodeMessage( encodeMessage( message ) ), message );
	} );

	it( 'preserves all binary payload bytes', () => {
		const payload = Uint8Array.from( Array.from( { length: 256 }, ( _value, index ) => index ) );
		const decoded = decodeMessage( encodeMessage( { type: 'data', room: ROOM, payload } ) );

		assert.strictEqual( decoded.type, 'data' );
		assert.deepStrictEqual( decoded.payload, payload );
	} );

	it( 'returns a data payload view into the input frame', () => {
		const frame = wireMessage( PROTOCOL_VERSION, 2, 'a', [ 7, 8 ] );
		const decoded = decodeMessage( frame );

		assert.strictEqual( decoded.type, 'data' );
		assert.strictEqual( decoded.payload.buffer, frame.buffer );
		frame[ frame.length - 1 ] = 9;
		assert.deepStrictEqual( decoded.payload, Uint8Array.from( [ 7, 9 ] ) );
	} );

	it( 'preserves an unrecognized private room close code', () => {
		assert.deepStrictEqual(
			decodeMessage( wireMessage( PROTOCOL_VERSION, 4, 'a', rawVarUint( 4999 ) ) ),
			{ type: 'room_closed', room: 'a', code: 4999 }
		);
	} );
} );

describe( 'encode validation', () => {
	it( 'rejects an unknown message type from an untyped caller', () => {
		for ( const type of [ 'future', 'toString', '__proto__' ] ) {
			assertProtocolError(
				() => encodeMessage( { type } as unknown as ProtocolMessage ),
				'unknown_message_type'
			);
		}
	} );

	const invalidFields: Array< {
		name: string;
		message: ProtocolMessage;
		reason: ProtocolErrorReason;
	} > = [
		{
			name: 'empty room',
			message: { type: 'subscribed', room: '' },
			reason: 'empty_room',
		},
		{
			name: 'room measured over the byte limit',
			message: { type: 'subscribed', room: '🚀'.repeat( 129 ) },
			reason: 'room_too_long',
		},
		{
			name: 'empty grant',
			message: { type: 'subscribe', room: ROOM, grant: '' },
			reason: 'empty_grant',
		},
		{
			name: 'oversized grant',
			message: { type: 'subscribe', room: ROOM, grant: 'g'.repeat( MAX_GRANT_BYTES + 1 ) },
			reason: 'grant_too_long',
		},
		{
			name: 'empty data payload',
			message: { type: 'data', room: ROOM, payload: new Uint8Array( 0 ) },
			reason: 'empty_payload',
		},
	];

	for ( const { name, message, reason } of invalidFields ) {
		it( `rejects ${ name }`, () => {
			assertProtocolError( () => encodeMessage( message ), reason );
		} );
	}

	it( 'rejects close codes outside the private-use integer range', () => {
		for ( const code of [ -1, 0, 1.5, NaN, 3999, 5000, 2 ** 32 ] ) {
			assertProtocolError(
				() => encodeMessage( { type: 'room_closed', room: ROOM, code } ),
				'invalid_close_code'
			);
		}
	} );
} );

describe( 'decode validation', () => {
	const malformedFrames: Array< {
		name: string;
		frame: Uint8Array;
		reason: ProtocolErrorReason;
	} > = [
		{ name: 'an empty frame', frame: new Uint8Array( 0 ), reason: 'truncated' },
		{
			name: 'a version-only frame',
			frame: wireMessage( PROTOCOL_VERSION ),
			reason: 'truncated',
		},
		{
			name: 'unsupported version 0',
			frame: wireMessage( 0, 1, 'a' ),
			reason: 'unsupported_version',
		},
		{
			name: 'unsupported version 2',
			frame: wireMessage( 2, 1, 'a' ),
			reason: 'unsupported_version',
		},
		{
			name: 'an unknown type before reading fields',
			frame: wireMessage( PROTOCOL_VERSION, 99 ),
			reason: 'unknown_message_type',
		},
		{
			name: 'a truncated room',
			frame: wireMessage( PROTOCOL_VERSION, 1, [ 10, 0x61, 0x62, 0x63 ] ),
			reason: 'truncated',
		},
		{
			name: 'an oversized room length',
			frame: wireMessage( PROTOCOL_VERSION, 1, rawVarUint( MAX_ROOM_NAME_BYTES + 1 ) ),
			reason: 'room_too_long',
		},
		{
			name: 'an oversized grant length',
			frame: wireMessage( PROTOCOL_VERSION, 0, 'a', rawVarUint( MAX_GRANT_BYTES + 1 ) ),
			reason: 'grant_too_long',
		},
		{
			name: 'an empty room',
			frame: wireMessage( PROTOCOL_VERSION, 1, '' ),
			reason: 'empty_room',
		},
		{
			name: 'an empty grant',
			frame: wireMessage( PROTOCOL_VERSION, 0, 'a', '' ),
			reason: 'empty_grant',
		},
		{
			name: 'invalid UTF-8',
			frame: wireMessage( PROTOCOL_VERSION, 1, [ 2, 0xff, 0xfe ] ),
			reason: 'invalid_string',
		},
		{
			name: 'subscribe trailing data',
			frame: wireMessage( PROTOCOL_VERSION, 0, 'a', 'grant', [ 0 ] ),
			reason: 'trailing_data',
		},
		{
			name: 'subscribed trailing data',
			frame: wireMessage( PROTOCOL_VERSION, 1, 'a', [ 0 ] ),
			reason: 'trailing_data',
		},
		{
			name: 'unsubscribe trailing data',
			frame: wireMessage( PROTOCOL_VERSION, 3, 'a', [ 0 ] ),
			reason: 'trailing_data',
		},
		{
			name: 'an empty data payload',
			frame: wireMessage( PROTOCOL_VERSION, 2, 'a' ),
			reason: 'empty_payload',
		},
		{
			name: 'a truncated room_closed',
			frame: wireMessage( PROTOCOL_VERSION, 4, 'a' ),
			reason: 'truncated',
		},
		{
			name: 'room_closed trailing data',
			frame: wireMessage( PROTOCOL_VERSION, 4, 'a', rawVarUint( 4004 ), 0 ),
			reason: 'trailing_data',
		},
		{
			name: 'a varuint longer than five bytes',
			frame: Uint8Array.from( [ 0x80, 0x80, 0x80, 0x80, 0x80, 0x01 ] ),
			reason: 'varuint_too_large',
		},
		{
			name: 'a five-byte varuint above 32 bits',
			frame: Uint8Array.from( [ 0xff, 0xff, 0xff, 0xff, 0x10 ] ),
			reason: 'varuint_too_large',
		},
		{
			name: 'the maximum 32-bit varuint as an unsupported version',
			frame: Uint8Array.from( [ 0xff, 0xff, 0xff, 0xff, 0x0f ] ),
			reason: 'unsupported_version',
		},
	];

	for ( const { name, frame, reason } of malformedFrames ) {
		it( `rejects ${ name }`, () => {
			assertProtocolError( () => decodeMessage( frame ), reason );
		} );
	}

	it( 'rejects room close codes outside the private-use range', () => {
		for ( const code of [ 0, 3999, 5000 ] ) {
			assertProtocolError(
				() => decodeMessage( wireMessage( PROTOCOL_VERSION, 4, 'a', rawVarUint( code ) ) ),
				'invalid_close_code'
			);
		}
	} );
} );
