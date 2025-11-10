/**
 * Internal dependencies
 */
import { SessionStatsExport } from './types';
import { TelemetryLogger, type TelemetryData } from '../TelemetryLogger';
import { Logger } from '@/utilities/logger';
import { isDevelopment } from '@/utilities/config';

import type { SessionStats } from './SessionStats';

/**
 * Defines the structure of session stats telemetry.
 */
type SessionStatsTelemetryData = TelemetryData & {
	event: 'real-time collaboration session' | 'devtest: real-time collaboration session';
	properties: Omit< SessionStatsExport, 'timestamp' >;
};

/**
 * Offers Logging functionality for session stats telemetry.
 */
export class SessionStatsTelemetryLogger extends TelemetryLogger< SessionStatsTelemetryData > {
	/**
	 * Initializes the class.
	 *
	 * @param sessionStats The SessionStats instance from which to get the stats
	 * @param logger The Logger instance to use for logging
	 */
	constructor( private sessionStats: SessionStats, logger: Logger ) {
		super( logger );
	}

	/**
	 * Returns the message to use when logging to Logger.
	 */
	protected getLoggerMessage(): string {
		return 'Multi-user session logged';
	}

	/**
	 * Prepares and returns the session stats data to be logged.
	 *
	 * @returns The telemetry data, or null if the data is invalid
	 */
	protected getTelemetryData(): SessionStatsTelemetryData | null {
		const stats = this.sessionStats.exportStats();

		if ( null === stats ) {
			return null;
		}

		if (
			stats.sessionTimeStart === null ||
			stats.sessionTimeLastActivity === null ||
			stats.sessionTimeLastActivity < stats.sessionTimeStart ||
			stats.usersActive > stats.usersMax ||
			stats.usersInactive > stats.usersMax ||
			stats.usersInactive + stats.usersActive > stats.usersMax ||
			stats.usersActive < 0 ||
			stats.usersInactive < 0 ||
			stats.usersMax < 0
		) {
			return null;
		}

		const eventPrefix = isDevelopment() ? 'devtest: ' : '';

		return {
			type: 'track',
			event: `${ eventPrefix }real-time collaboration session`,
			timestamp: stats.timestamp,
			properties: {
				postId: stats.postId,
				sessionDuration: stats.sessionDuration,
				sessionTimeLastActivity: stats.sessionTimeLastActivity,
				sessionTimeStart: stats.sessionTimeStart,
				usersActive: stats.usersActive,
				usersInactive: stats.usersInactive,
				usersMax: stats.usersMax,
			},
		};
	}
}
