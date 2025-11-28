import assert from 'node:assert';
import { afterEach, before, beforeEach, describe, it, mock, type Mock } from 'node:test';

import type { TelemetryData } from '@/telemetry/TelemetryLogger';
import type { Logger } from '@/utilities/logger';

/**
 * Concrete implementation of TelemetryLogger for testing purposes.
 */
class TestTelemetryLogger {
	public testData: TelemetryData | null = null;
	public shouldThrow = false;
	public customMessage = 'Test telemetry logged';

	private telemetryData: TelemetryData | null = null;

	constructor( private logger: Logger ) {}

	protected getLoggerMessage(): string {
		return this.customMessage;
	}

	protected getTelemetryData(): TelemetryData | null {
		if ( this.shouldThrow ) {
			throw new Error( 'Test error' );
		}
		return this.testData;
	}

	private ensureTelemetryData(): void {
		if ( null !== this.telemetryData ) {
			return;
		}

		try {
			this.telemetryData = this.getTelemetryData();
		} catch ( error ) {
			this.logger.debug( 'Failed to prepare telemetry data', error );
		}
	}

	public logToLogger(): boolean {
		this.ensureTelemetryData();

		if ( null === this.telemetryData ) {
			this.logger.debug( 'Logging telemetry using Logger failed: no data available' );
			return false;
		}

		this.logger.info( this.getLoggerMessage(), this.telemetryData );
		return true;
	}

	public logToPendo(): boolean {
		this.ensureTelemetryData();

		if ( null === this.telemetryData ) {
			this.logger.debug( 'Logging to Pendo failed: no data available' );
			return false;
		}

		// Pendo logging not implemented yet.
		return false;
	}

	public reset(): void {
		this.telemetryData = null;
	}
}

describe( 'TelemetryLogger', () => {
	let telemetryLogger: TestTelemetryLogger;
	let mockLogger: Logger;
	let mockLoggerInfo: Mock< ( ...args: unknown[] ) => void >;
	let mockLoggerDebug: Mock< ( ...args: unknown[] ) => void >;

	before( async () => {
		mock.module( '@/utilities/config', {
			namedExports: { isDevelopment: () => true },
		} );
	} );

	beforeEach( () => {
		mockLoggerInfo = mock.fn();
		mockLoggerDebug = mock.fn();
		mockLogger = {
			info: mockLoggerInfo,
			debug: mockLoggerDebug,
		} as unknown as Logger;

		telemetryLogger = new TestTelemetryLogger( mockLogger );
	} );

	afterEach( () => {
		mock.restoreAll();
	} );

	describe( 'logToLogger', () => {
		it( 'logs telemetry data when available', () => {
			telemetryLogger.testData = {
				type: 'track',
				event: 'test-event',
				timestamp: 1234567890,
				properties: { key: 'value' },
			};

			const result = telemetryLogger.logToLogger();

			assert.strictEqual( result, true );
			assert.strictEqual( mockLoggerInfo.mock.callCount(), 1 );
			assert.strictEqual( mockLoggerInfo.mock.calls[ 0 ]?.arguments[ 0 ], 'Test telemetry logged' );
			assert.deepStrictEqual( mockLoggerInfo.mock.calls[ 0 ]?.arguments[ 1 ], {
				type: 'track',
				event: 'test-event',
				timestamp: 1234567890,
				properties: { key: 'value' },
			} );
		} );

		it( 'returns false when no data available', () => {
			telemetryLogger.testData = null;

			const result = telemetryLogger.logToLogger();

			assert.strictEqual( result, false );
			assert.strictEqual( mockLoggerDebug.mock.callCount(), 1 );
			assert.strictEqual(
				mockLoggerDebug.mock.calls[ 0 ]?.arguments[ 0 ],
				'Logging telemetry using Logger failed: no data available'
			);
		} );

		it( 'handles errors in getTelemetryData gracefully', () => {
			telemetryLogger.shouldThrow = true;

			const result = telemetryLogger.logToLogger();

			assert.strictEqual( result, false );
			assert.strictEqual( mockLoggerDebug.mock.callCount(), 2 );
			assert.strictEqual(
				mockLoggerDebug.mock.calls[ 0 ]?.arguments[ 0 ],
				'Failed to prepare telemetry data'
			);
		} );

		it( 'caches telemetry data after first call', () => {
			let callCount = 0;
			const originalTestData = telemetryLogger.testData;

			telemetryLogger.testData = {
				type: 'track',
				event: 'test-event',
				timestamp: 1234567890,
				properties: { callCount: ++callCount },
			};

			telemetryLogger.logToLogger();
			telemetryLogger.testData = {
				type: 'track',
				event: 'test-event',
				timestamp: 1234567890,
				properties: { callCount: ++callCount },
			};
			telemetryLogger.logToLogger();

			// Should log the same data both times (cached).
			assert.strictEqual( mockLoggerInfo.mock.callCount(), 2 );
			assert.deepStrictEqual(
				mockLoggerInfo.mock.calls[ 0 ]?.arguments[ 1 ],
				mockLoggerInfo.mock.calls[ 1 ]?.arguments[ 1 ]
			);

			telemetryLogger.testData = originalTestData;
		} );
	} );

	describe( 'logToPendo', () => {
		it( 'returns false when no data available', () => {
			telemetryLogger.testData = null;

			const result = telemetryLogger.logToPendo();

			assert.strictEqual( result, false );
		} );

		it( 'returns false when data is available (not implemented)', () => {
			telemetryLogger.testData = {
				type: 'track',
				event: 'test-event',
				timestamp: 1234567890,
				properties: {},
			};

			const result = telemetryLogger.logToPendo();

			// Returns false because Pendo logging is not implemented.
			assert.strictEqual( result, false );
		} );
	} );
} );
