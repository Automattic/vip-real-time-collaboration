import assert from 'node:assert';
import { describe, it, before, beforeEach, after, afterEach, mock, type Mock } from 'node:test';

import { generateUUID } from './crypto';

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
