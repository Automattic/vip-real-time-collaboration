import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock, type Mock } from 'node:test';

import { Logger, LogLevel } from './logger';

describe( 'Logger', () => {
	let mockConsoleLog: Mock< typeof console.log >;

	beforeEach( () => {
		mockConsoleLog = mock.method( console, 'log', () => {} );
	} );

	afterEach( () => {
		mock.restoreAll();
	} );

	it( 'should log messages at or above the threshold', () => {
		const logger = new Logger( 'test', LogLevel.WARNING );

		logger.debug( 'This is a debug message' ); // Should not be logged
		logger.info( 'This is an info message' ); // Should not be logged
		logger.warn( 'This is a warning message' ); // Should be logged
		logger.error( 'This is an error message' ); // Should be logged
		logger.critical( 'This is a critical message' ); // Should be logged

		assert.strictEqual( mockConsoleLog.mock.callCount(), 3 );
	} );
} );
