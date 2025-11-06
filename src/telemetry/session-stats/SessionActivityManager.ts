/**
 * External dependencies
 */
import { select } from '@wordpress/data';
import * as Y from 'yjs';

/**
 * Internal dependencies
 */
import { SessionStats } from './SessionStats';
import { SessionStatsTelemetryLogger } from './SessionStatsTelemetryLogger';
import { UserInactivityTimer } from './UserInactivityTimer';
import { SESSION_STATS_ORIGIN, SESSION_TIMEOUT_IN_SEC } from './constants';
import {
	areUserSetsEqual,
	getConnectedUserCount,
	getConnectedUserIds,
	isPositiveInteger,
} from './utils';
import { store as awarenessStore } from '@/store/awareness-store';
import { Logger } from '@/utilities/logger';

import type { Awareness } from 'y-protocols/awareness';

/**
 * Coordinates collaborative session events and the execution of operations in
 * response to them.
 *
 * Subscribes to session events, manages session state transitions, tracks user
 * activity, responds to user and document changes, handles inactivity, logs
 * session data.
 */
export class SessionActivityManager {
	private inactivityTimer: UserInactivityTimer;
	private logger = new Logger( SESSION_STATS_ORIGIN );
	private sessionStats: SessionStats;
	private isLoggingInProgress = false;
	private logSessionTimeout?: NodeJS.Timeout;

	private awarenessChangeHandler?: () => void;
	private documentUpdateHandler?: (
		update: Uint8Array,
		origin: unknown,
		doc: Y.Doc,
		transaction: Y.Transaction
	) => void;

	/**
	 * Creates a SessionActivityManager instance, initializes the session
	 * stats tracker and inactivity timer, and subscribes to user and document
	 * change events.
	 *
	 * @param awareness The Yjs Awareness instance to use
	 */
	constructor( private awareness: Awareness ) {
		this.sessionStats = new SessionStats( awareness, this.logger );

		this.inactivityTimer = new UserInactivityTimer(
			SESSION_TIMEOUT_IN_SEC * 1000,
			() => this.sessionStats.getLastActivityTime(),
			() => this.handleInactivityTimeout()
		);

		this.subscribeToUserChanges();
		this.subscribeToDocumentChanges();
	}

	/**
	 * Subscribes to user changes in the awareness store.
	 *
	 * Executes operations that need to trigger on user change events.
	 */
	private subscribeToUserChanges(): void {
		let previousUserCount: number | undefined;
		let previousUserIds: Set< number > | undefined;

		this.awarenessChangeHandler = () => {
			let connectedUserIds: number[];
			let currentUserCount: number;
			let currentUserIdsSet: Set< number >;

			try {
				connectedUserIds = getConnectedUserIds();
				currentUserIdsSet = new Set( connectedUserIds );
				currentUserCount = currentUserIdsSet.size;
			} catch ( error ) {
				this.logger.debug( 'Failed to get user states', error );

				return;
			}

			const userCompositionChanged =
				previousUserIds === undefined ||
				currentUserCount !== previousUserCount ||
				! areUserSetsEqual( previousUserIds, currentUserIdsSet );

			if ( ! userCompositionChanged ) {
				return;
			}

			// Transition from 1 user to 2+ users: Initialize session.
			if (
				( previousUserCount === undefined || previousUserCount <= 1 ) &&
				currentUserCount >= 2
			) {
				// Cancel any pending log timeout since we're going back to 2+ users.
				if ( this.logSessionTimeout ) {
					clearTimeout( this.logSessionTimeout );
					this.logSessionTimeout = undefined;
				}

				this.initializeSessionStatsData( connectedUserIds );
			}

			// Transition from 2+ users to 1 user: Schedule session stats logging.
			if ( previousUserCount !== undefined && previousUserCount >= 2 && currentUserCount <= 1 ) {
				this.inactivityTimer.stop();
				this.scheduleSessionStatsLogging();
			}

			// Add any newly connected users to the session's all users list.
			if ( this.sessionStats.isRecordingStats() && currentUserCount >= 2 ) {
				this.sessionStats.addUsersToAllUsers( connectedUserIds );
			}

			previousUserCount = currentUserCount;
			previousUserIds = currentUserIdsSet;
		};

		this.awareness.on( 'change', this.awarenessChangeHandler );
	}

	/**
	 * Subscribes to document changes in the Yjs document.
	 *
	 * Local changes mark the originating user as active. Both Local and remote
	 * document updates reset the inactivity timer and update the shared last
	 * activity time.
	 */
	private subscribeToDocumentChanges(): void {
		this.documentUpdateHandler = (
			update: Uint8Array,
			origin: unknown,
			doc: Y.Doc,
			transaction: Y.Transaction
		) => {
			if ( origin === SESSION_STATS_ORIGIN ) {
				return;
			}

			if ( ! this.transactionHasContentChanges( transaction ) ) {
				return;
			}

			// Initialize new session if the previous one got logged due to inactivity.
			if ( ! this.sessionStats.isRecordingStats() ) {
				if ( getConnectedUserCount() >= 2 ) {
					this.initializeSessionStatsData();
				}

				if ( ! this.sessionStats.isRecordingStats() ) {
					return;
				}
			}

			this.inactivityTimer.restart();
			this.sessionStats.updateLastActivityTime();

			// If this is a local change, mark the originating user as active.
			if ( transaction.local ) {
				try {
					const { getActiveUsers } = select( awarenessStore );
					const currentUser = getActiveUsers().get( this.awareness.clientID );

					if ( currentUser?.userInfo?.isMe ) {
						const userId = currentUser.userInfo.id;

						if ( isPositiveInteger( userId ) ) {
							this.sessionStats.addUserToActiveUsers( userId );
						}
					}
				} catch ( error ) {
					this.logger.debug( 'Failed to resolve current user', error );
				}
			}
		};

		this.awareness.doc.on( 'update', this.documentUpdateHandler );
	}

	/**
	 * Determines if a transaction contains content changes.
	 *
	 * @param transaction The Y.Doc transaction to check
	 * @returns True if transaction contains content changes, false otherwise
	 */
	private transactionHasContentChanges( transaction: Y.Transaction ): boolean {
		if ( 0 === transaction.changed.size ) {
			return false;
		}

		// Maps that should not contain any content changes.
		const excludedMaps = new Set( [
			this.awareness.doc.getMap( SESSION_STATS_ORIGIN ),
			this.awareness.doc.getMap( 'awareness' ),
			this.awareness.doc.getMap( 'metadata' ),
		] );

		// Determine if there are content changes in the transaction.
		for ( const [ item ] of transaction.changed ) {
			if ( item instanceof Y.Map ) {
				if ( excludedMaps.has( item ) ) {
					continue;
				}
			}

			return true;
		}

		return false;
	}

	/**
	 * Logs session stats after verifying that no recent user activity has
	 * occurred.
	 */
	private handleInactivityTimeout(): void {
		const lastActivityTime = this.sessionStats.getLastActivityTime();

		// Defensive check: verify inactivity in case of race conditions.
		if ( lastActivityTime !== null ) {
			const inactiveDuration = Date.now() - lastActivityTime;
			const timeoutMs = this.inactivityTimer.getTimeoutMs();

			if ( inactiveDuration < timeoutMs ) {
				this.logger.debug( 'Activity detected after timer fired, restarting timer' );
				this.inactivityTimer.restart();

				return;
			}
		}

		if ( ! this.sessionStats.isRecordingStats() ) {
			return;
		}

		if ( getConnectedUserCount() < 2 ) {
			return;
		}

		this.logSessionStats();
	}

	/**
	 * Initializes session stats data if stats aren't being recorded and there
	 * are enough connected users.
	 *
	 * @param connectedUserIds Array of user IDs currently connected to the session
	 */
	private initializeSessionStatsData( connectedUserIds: number[] | null = null ): void {
		if ( this.sessionStats.isRecordingStats() ) {
			return;
		}

		if ( null === connectedUserIds ) {
			connectedUserIds = getConnectedUserIds();
		}

		if ( connectedUserIds.length < 2 ) {
			return;
		}

		if ( true === this.sessionStats.initializeStats( connectedUserIds ) ) {
			this.inactivityTimer.start();
		}
	}

	/**
	 * Schedules session stats logging, preventing disconnecting clients from
	 * erroneously logging a multi-user session in progress.
	 *
	 * When disconnecting from multi-user sessions, Firefox always counts
	 * remaining users as 1 and incorrectly logs. The same behavior can occur in
	 * other browsers under certain edge cases.
	 */
	private scheduleSessionStatsLogging(): void {
		if ( this.logSessionTimeout ) {
			clearTimeout( this.logSessionTimeout );
		}

		this.logSessionTimeout = setTimeout( () => {
			this.logSessionTimeout = undefined;

			// Disconnecting clients shouldn't log.
			try {
				const { getActiveUsers } = select( awarenessStore );
				const currentUser = getActiveUsers().get( this.awareness.clientID );

				if ( currentUser?.userInfo?.isConnected === false ) {
					return;
				}
			} catch ( error ) {
				this.logger.debug( 'Failed to check current user connection status', error );

				return;
			}

			// Log only if user count is still 1 or less.
			if ( getConnectedUserCount() <= 1 ) {
				this.logSessionStats();
			}
		}, 100 );
	}

	/**
	 * Calls SessionLogger to log the session's stats.
	 */
	private logSessionStats(): void {
		if ( this.isLoggingInProgress ) {
			return;
		}

		if ( ! this.sessionStats.isRecordingStats() ) {
			return;
		}

		const sessionInitializerClientId = this.sessionStats.getSessionInitializerClientId();
		if ( sessionInitializerClientId === null ) {
			return;
		}

		if ( ! this.sessionStats.isLeader( sessionInitializerClientId ) ) {
			return;
		}

		this.isLoggingInProgress = true;

		try {
			const sessionLogger = new SessionStatsTelemetryLogger( this.sessionStats, this.logger );

			sessionLogger.logToLogger();
			sessionLogger.logToPendo();
		} finally {
			// Always reset the flag, even if logging fails.
			this.isLoggingInProgress = false;
		}
	}

	/**
	 * Cleans up all subscriptions and timers.
	 */
	public destroy(): void {
		this.inactivityTimer.stop();

		if ( this.logSessionTimeout ) {
			clearTimeout( this.logSessionTimeout );
			this.logSessionTimeout = undefined;
		}

		if ( this.awarenessChangeHandler ) {
			this.awareness.off( 'change', this.awarenessChangeHandler );
		}

		if ( this.documentUpdateHandler ) {
			this.awareness.doc.off( 'update', this.documentUpdateHandler );
		}
	}
}
