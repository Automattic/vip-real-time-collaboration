import assert from 'node:assert';
import { describe, it, before, beforeEach, after, afterEach, mock, type Mock } from 'node:test';

import { generateHash, generateUUID } from './crypto';

function getMockWindow( overrides: Partial< typeof global.window > = {} ): typeof global.window {
	return {
		isSecureContext: true,
		...overrides,
	} as typeof global.window;
}

describe( 'crypto utilities', () => {
	let originalProcess: string | undefined;
	let originalWindow: typeof global.window;
	let mockConsoleLog: Mock< typeof console.log >;

	before( () => {
		originalProcess = process.env.NODE_ENV;
		originalWindow = global.window;
	} );

	after( () => {
		process.env.NODE_ENV = originalProcess;
		global.window = originalWindow;
	} );

	beforeEach( () => {
		mockConsoleLog = mock.method( console, 'log', () => {} );
	} );

	afterEach( () => {
		mock.restoreAll();
	} );

	describe( 'generateHash', () => {
		describe( 'in secure context', () => {
			let cryptoMock: Mock< typeof window.crypto.subtle.digest >;

			beforeEach( () => {
				cryptoMock = mock.fn(
					( _algorithm: string, _message: Uint8Array< ArrayBufferLike > ): Promise< ArrayBuffer > =>
						Promise.resolve( new TextEncoder().encode( 'mock generated hash' ).buffer )
				);

				global.window = getMockWindow( {
					crypto: {
						subtle: {
							digest: cryptoMock,
						},
					} as unknown as Crypto,
				} );
			} );

			it( 'should return mock hash', async () => {
				const result = await generateHash( 'test message', 'SHA-256' );

				// 'mock generated hash' in hex
				assert.strictEqual( result, '6d6f636b2067656e6572617465642068617368' );
				assert.strictEqual( cryptoMock.mock.callCount(), 1 );
				assert.strictEqual( mockConsoleLog.mock.callCount(), 0 );

				const [ algorithm, message ] = cryptoMock.mock.calls[ 0 ]?.arguments ?? new Array( 2 );

				assert.strictEqual( algorithm, 'SHA-256' );
				assert.deepEqual(
					message,
					new Uint8Array( [ 116, 101, 115, 116, 32, 109, 101, 115, 115, 97, 103, 101 ] )
				);
			} );
		} );

		describe( 'in insecure context', () => {
			beforeEach( () => {
				global.window = getMockWindow( { isSecureContext: false } );
				process.env.NODE_ENV = 'development';
			} );

			it( 'should use fallback hash function and warn in development mode', async () => {
				const result = await generateHash( 'test message', 'SHA-256' );

				assert.strictEqual(
					result,
					'3f0a377ba0a4a460ecb616f6507ce0d8cfa3e704025d4fda3ed0c5ca05468728'
				);
				assert.strictEqual( mockConsoleLog.mock.callCount(), 1 );
				assert.strictEqual(
					mockConsoleLog.mock.calls[ 0 ]?.arguments[ 1 ],
					'Using fallback hash function in non-secure context.'
				);

				// Verify consistent output.
				const result2 = await generateHash( 'test message', 'SHA-256' );
				assert.strictEqual(
					result2,
					'3f0a377ba0a4a460ecb616f6507ce0d8cfa3e704025d4fda3ed0c5ca05468728',
					'Hash should be deterministic'
				);

				// Test with different input.
				const result3 = await generateHash( 'different message', 'SHA-256' );
				assert.strictEqual(
					result3,
					'50e3b1acaf1fb9e56f93d0e8a5f07875c3baf32462227390dca20176f05cbd9b'
				);
			} );
		} );

		describe( 'in insecure context (non-development)', () => {
			beforeEach( () => {
				global.window = getMockWindow( { isSecureContext: false } );
				process.env.NODE_ENV = 'production';
			} );

			it( 'should throw error in production mode', async () => {
				await assert.rejects( () => generateHash( 'test message', 'SHA-256' ), {
					name: 'Error',
					message: 'Unable to generate hash outside of secure context in non-development mode!',
				} );
			} );
		} );
	} );

	describe( 'generateUUID', () => {
		const uuidMock = mock.fn(
			(): `${ string }-${ string }-${ string }-${ string }-${ string }` =>
				'12345678-1234-4abc-8def-123456789abc'
		);

		describe( 'in secure context', () => {
			beforeEach( () => {
				global.window = getMockWindow( {
					crypto: {
						randomUUID: uuidMock,
					} as unknown as Crypto,
				} );
			} );

			it( 'should return mock UUID', () => {
				const result = generateUUID();

				assert.strictEqual( result, '12345678-1234-4abc-8def-123456789abc' );
				assert.strictEqual( uuidMock.mock.callCount(), 1 );
			} );
		} );

		describe( 'in insecure context', () => {
			beforeEach( () => {
				global.window = getMockWindow( { isSecureContext: false } );
				process.env.NODE_ENV = 'development';
			} );

			it( 'should use fallback UUID function and warn in development mode', () => {
				const result = generateUUID();

				assert.strictEqual( typeof result, 'string' );
				assert.match(
					result,
					/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
				);

				assert.strictEqual( mockConsoleLog.mock.callCount(), 1 );
				assert.strictEqual(
					mockConsoleLog.mock.calls[ 0 ]?.arguments[ 1 ],
					'Using fallback UUID function in non-secure context.'
				);
			} );

			it( 'should generate different UUIDs in fallback mode', () => {
				const uuid1 = generateUUID();
				const uuid2 = generateUUID();

				assert.notStrictEqual( uuid1, uuid2 );
			} );
		} );

		describe( 'in insecure context (non-development)', () => {
			beforeEach( () => {
				global.window = getMockWindow( { isSecureContext: false } );
				process.env.NODE_ENV = 'production';
			} );

			it( 'should throw error in production mode', () => {
				assert.throws( () => generateUUID(), {
					name: 'Error',
					message: 'Unable to generate UUID outside of secure context in non-development mode!',
				} );

				assert.strictEqual( mockConsoleLog.mock.callCount(), 0 );
			} );
		} );
	} );
} );
