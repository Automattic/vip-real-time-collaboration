import assert from 'node:assert';
import { describe, it } from 'node:test';

import { getRequestPathname, getRawDataSizeBytes } from './utils';

import type { IncomingMessage } from 'node:http';

function createRequest( url?: string ): IncomingMessage {
	return { url } as IncomingMessage;
}

describe( 'getRequestPathname', () => {
	it( 'should return "/" for root path', () => {
		const request = createRequest( '/' );
		assert.strictEqual( getRequestPathname( request ), '/' );
	} );

	it( 'should extract pathname from URL without query string', () => {
		const request = createRequest( '/api/users' );
		assert.strictEqual( getRequestPathname( request ), '/api/users' );
	} );

	it( 'should remove query parameters', () => {
		const request = createRequest( '/api/users?id=123&name=test' );
		assert.strictEqual( getRequestPathname( request ), '/api/users' );
	} );

	it( 'should remove trailing slashes from non-root paths', () => {
		const request = createRequest( '/api/users/' );
		assert.strictEqual( getRequestPathname( request ), '/api/users' );
	} );

	it( 'should remove multiple trailing slashes', () => {
		const request = createRequest( '/api/users///' );
		assert.strictEqual( getRequestPathname( request ), '/api/users' );
	} );

	it( 'should remove trailing slashes and query parameters', () => {
		const request = createRequest( '/api/users/?id=123' );
		assert.strictEqual( getRequestPathname( request ), '/api/users' );
	} );

	it( 'should preserve root path with trailing slash', () => {
		const request = createRequest( '/?' );
		assert.strictEqual( getRequestPathname( request ), '/' );
	} );

	it( 'should handle missing URL', () => {
		const request = createRequest();
		assert.strictEqual( getRequestPathname( request ), '/' );
	} );

	it( 'should handle undefined URL', () => {
		const request = createRequest( undefined );
		assert.strictEqual( getRequestPathname( request ), '/' );
	} );

	it( 'should handle empty string URL', () => {
		const request = createRequest( '' );
		assert.strictEqual( getRequestPathname( request ), '/' );
	} );
} );

describe( 'getRawDataSizeBytes', () => {
	it( 'should calculate size of a single Buffer', () => {
		const buffer = Buffer.from( 'hello world' );
		assert.strictEqual( getRawDataSizeBytes( buffer ), 11 );
	} );

	it( 'should calculate size of an empty Buffer', () => {
		const buffer = Buffer.from( '' );
		assert.strictEqual( getRawDataSizeBytes( buffer ), 0 );
	} );

	it( 'should calculate size of an array of Buffers', () => {
		const buffers = [ Buffer.from( 'hello' ), Buffer.from( ' ' ), Buffer.from( 'world' ) ];
		assert.strictEqual( getRawDataSizeBytes( buffers ), 11 );
	} );

	it( 'should calculate size of an empty array', () => {
		const buffers: Buffer[] = [];
		assert.strictEqual( getRawDataSizeBytes( buffers ), 0 );
	} );

	it( 'should calculate size of an array with one Buffer', () => {
		const buffers = [ Buffer.from( 'test' ) ];
		assert.strictEqual( getRawDataSizeBytes( buffers ), 4 );
	} );

	it( 'should calculate size of an ArrayBuffer', () => {
		const arrayBuffer = new ArrayBuffer( 20 );
		assert.strictEqual( getRawDataSizeBytes( arrayBuffer ), 20 );
	} );

	it( 'should calculate size of an empty ArrayBuffer', () => {
		const arrayBuffer = new ArrayBuffer( 0 );
		assert.strictEqual( getRawDataSizeBytes( arrayBuffer ), 0 );
	} );

	it( 'should handle ArrayBuffer with UTF-8 data', () => {
		const encoder = new TextEncoder();
		const arrayBuffer = encoder.encode( 'hello world' ).buffer;
		assert.strictEqual( getRawDataSizeBytes( arrayBuffer ), 11 );
	} );

	it( 'should calculate size with multi-byte characters', () => {
		const buffer = Buffer.from( 'Hello 世界' );
		assert.strictEqual( getRawDataSizeBytes( buffer ), 12 );
	} );

	it( 'should handle array of Buffers with varying sizes', () => {
		const buffers = [
			Buffer.from( 'a' ),
			Buffer.from( 'bb' ),
			Buffer.from( 'ccc' ),
			Buffer.from( 'dddd' ),
		];
		assert.strictEqual( getRawDataSizeBytes( buffers ), 10 );
	} );
} );
