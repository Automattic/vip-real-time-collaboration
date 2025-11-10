/**
 * Internal dependencies
 */
import { isDevelopment } from '@/utilities/config';
import { Logger } from '@/utilities/logger';

/**
 * WordPress dependencies
 */
import apiFetch from '@wordpress/api-fetch';

/**
 * Base structure for telemetry data.
 */
export type TelemetryData = {
	type: 'track';
	event: string;
	timestamp: number;
	properties: Record< string, unknown >;
};

/**
 * Generic base class for telemetry logging.
 *
 * Provides a standard interface for logging telemetry data to multiple destinations
 * (Logger, Pendo, etc.). Subclasses should implement the abstract methods to define
 * their specific telemetry data structure.
 */
export abstract class TelemetryLogger< T extends TelemetryData = TelemetryData > {
	protected telemetryData: T | null = null;

	/**
	 * Initializes the TelemetryLogger.
	 *
	 * @param logger The Logger instance to use for logging
	 */
	constructor( protected logger: Logger ) {}

	/**
	 * Abstract method to prepare and retrieve telemetry data.
	 *
	 * Subclasses must implement this to define their specific data structure.
	 *
	 * @returns The telemetry data to be logged, or null if data cannot be prepared
	 */
	protected abstract getTelemetryData(): T | null;

	/**
	 * Ensures telemetry data is prepared before use.
	 *
	 * Called lazily to avoid issues with subclass property initialization.
	 * On error, leaves telemetryData as null to allow retry on next call.
	 */
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

	/**
	 * Logs the telemetry data using Logger.
	 *
	 * @returns True if logging succeeded, false otherwise
	 */
	public logToLogger(): boolean {
		this.ensureTelemetryData();

		if ( null === this.telemetryData ) {
			this.logger.debug( 'Logging telemetry using Logger failed: no data available' );
			return false;
		}

		this.logger.info( this.getLoggerMessage(), this.telemetryData );
		return true;
	}

	/**
	 * Logs the telemetry data to Pendo.
	 *
	 * @returns True if logging succeeded or skipped (dev mode), false otherwise
	 */
	public async logToPendo(): Promise< boolean > {
		this.ensureTelemetryData();

		if ( null === this.telemetryData ) {
			this.logger.debug( 'Logging to Pendo failed: no data available' );
			return false;
		}

		// Turn this off to test in development mode.
		if ( isDevelopment() ) {
			return true;
		}

		try {
			const { properties, timestamp } = this.telemetryData;

			const response = await apiFetch< { success: boolean; message?: string } >( {
				path: '/vip-rtc/v1/telemetry/session-stats',
				method: 'POST',
				data: {
					...properties,
					timestamp,
				},
			} );

			this.logger.info( 'Telemetry sent to Pendo successfully', response );
			return true;
		} catch ( error ) {
			this.logger.debug( 'Failed to send telemetry to Pendo', error );

			return false;
		}
	}

	/**
	 * Returns the message to use when logging to Logger.
	 *
	 * Subclasses can override this to customize the message.
	 *
	 * @returns The log message
	 */
	protected getLoggerMessage(): string {
		return 'Telemetry logged';
	}
}
