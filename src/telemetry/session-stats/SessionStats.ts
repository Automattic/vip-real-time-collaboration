/**
 * External dependencies
 */
import { select } from '@wordpress/data';
import { store as editorStore } from '@wordpress/editor';
import * as Y from 'yjs';

/**
 * Internal dependencies
 */
import { SESSION_STATS_ORIGIN } from './constants';
import { PostId, SessionStatsExport } from './types';
import { isPositiveInteger } from './utils';
import { Logger } from '@/utilities/logger';

import type { Awareness } from 'y-protocols/awareness';

/**
 * Defines the session stats schema for storage in Yjs.
 */
export type SessionStatsSchema = {
	activeUserIds: Y.Map< boolean >;
	allUserIds: Y.Map< boolean >;
	isRecordingStats: boolean;
	sessionInitializerClientId: number | null;
	sessionTimeLastActivity: number | null;
	sessionTimeStart: number | null;
	sessionExpired: boolean;
};

/**
 * Type-safe keys of SessionStatsSchema.
 */
type SessionStatsKey = keyof SessionStatsSchema;

/**
 * Manages multi-user session statistics using Yjs Awareness for shared state.
 */
export class SessionStats {
	private sessionMap: Y.Map< unknown >;

	/**
	 * Initializes the class.
	 *
	 * @param awareness The Yjs Awareness instance to use for shared state
	 * @param logger The Logger instance to use for logging
	 */
	constructor( private awareness: Awareness, private logger: Logger ) {
		if ( ! this.awareness?.doc ) {
			throw new Error( 'Awareness document is not available' );
		}

		this.sessionMap = this.awareness.doc.getMap( SESSION_STATS_ORIGIN );
	}

	/**
	 * Type-safe getter for properties.
	 */
	private get< K extends SessionStatsKey >( key: K ): SessionStatsSchema[ K ] | undefined {
		return this.sessionMap.get( key ) as SessionStatsSchema[ K ] | undefined;
	}

	/**
	 * Type-safe setter for properties.
	 */
	private set< K extends SessionStatsKey >( key: K, value: SessionStatsSchema[ K ] ): void {
		this.sessionMap.set( key, value );
	}

	/**
	 * Type-safe delete for properties.
	 */
	private delete< K extends SessionStatsKey >( key: K ): void {
		this.sessionMap.delete( key );
	}

	/**
	 * Returns session start timestamp in milliseconds, or null if not set.
	 */
	private getSessionStartTime(): number | null {
		return this.get( 'sessionTimeStart' ) ?? null;
	}

	/**
	 * Returns the allUserIds Y.Map or undefined if not initialized.
	 */
	private getAllUserIds(): Y.Map< boolean > | undefined {
		return this.get( 'allUserIds' );
	}

	/**
	 * Returns the activeUserIds Y.Map or undefined if not initialized.
	 */
	private getActiveUserIds(): Y.Map< boolean > | undefined {
		return this.get( 'activeUserIds' );
	}

	/**
	 * Returns the number of active users in the session.
	 *
	 * A user is considered active if they have performed content changes during
	 * the session.
	 */
	private getActiveUserCount(): number {
		return this.getActiveUserIds()?.size ?? 0;
	}

	/**
	 * Returns the number of inactive users in the session.
	 */
	private getInactiveUserCount(): number {
		return Math.max( 0, this.getTotalUserCount() - this.getActiveUserCount() );
	}

	/**
	 * Returns the total number of users reached during the session.
	 */
	private getTotalUserCount(): number {
		return this.getAllUserIds()?.size ?? 0;
	}

	/**
	 * Returns the session's duration in seconds.
	 */
	private getSessionDuration(): number {
		const sessionStartTime = this.getSessionStartTime();

		if ( ! sessionStartTime ) {
			this.logger.debug( 'Session start time is missing' );

			return 0;
		}

		const lastActivityTime = this.getLastActivityTime();

		if ( ! lastActivityTime ) {
			this.logger.debug( 'Session last activity time is missing' );

			return 0;
		}

		const durationMs = lastActivityTime - sessionStartTime;

		return Math.floor( durationMs / 1000 );
	}

	/**
	 * Returns the current post ID.
	 */
	private getCurrentPostId(): PostId {
		try {
			return select( editorStore ).getCurrentPostId();
		} catch ( error ) {
			this.logger.debug( 'Failed to get current post ID', error );

			return null;
		}
	}

	/**
	 * Returns whether session stats are being recorded.
	 */
	public isRecordingStats(): boolean {
		return this.get( 'isRecordingStats' ) ?? false;
	}

	/**
	 * Returns last activity timestamp in milliseconds, or null if not set.
	 */
	public getLastActivityTime(): number | null {
		return this.get( 'sessionTimeLastActivity' ) ?? null;
	}

	/**
	 * Returns the client ID that initialized the session, or null if not set.
	 */
	public getSessionInitializerClientId(): number | null {
		return this.get( 'sessionInitializerClientId' ) ?? null;
	}

	/**
	 * Returns whether the session is expired.
	 */
	public isSessionExpired(): boolean {
		return this.get( 'sessionExpired' ) ?? false;
	}

	/**
	 * Updates the last activity timestamp to the current time.
	 */
	public updateLastActivityTime(): void {
		if ( ! this.isStateCoordinator() ) {
			return;
		}

		this.awareness.doc.transact( () => {
			this.set( 'sessionTimeLastActivity', Date.now() );
		}, SESSION_STATS_ORIGIN );
	}

	/**
	 * Sets whether the session is expired.
	 *
	 * @param expired Whether the session is expired
	 */
	public setSessionExpired( expired: boolean ): void {
		if ( ! this.isStateCoordinator() ) {
			return;
		}

		this.awareness.doc.transact( () => {
			this.set( 'sessionExpired', expired );
		}, SESSION_STATS_ORIGIN );
	}

	/**
	 * Initializes session stats if not already initialized.
	 *
	 * @param initialUserIds Array of user IDs to initialize the stats with
	 * @returns True if initialization occurred, false otherwise
	 */
	public initializeStats( initialUserIds: number[] ): boolean {
		if ( initialUserIds.length < 2 ) {
			return false;
		}

		if ( this.isRecordingStats() ) {
			return false;
		}

		if ( ! this.isSessionOwner() ) {
			return false;
		}

		let initialized = false;

		try {
			this.awareness.doc.transact( () => {
				const timestamp = Date.now();
				this.set( 'isRecordingStats', true );
				this.set( 'sessionTimeLastActivity', timestamp );
				this.set( 'sessionTimeStart', timestamp );
				this.set( 'sessionInitializerClientId', this.awareness.clientID );
				this.set( 'sessionExpired', false );

				// Initialize allUserIds map.
				const allUserIds = new Y.Map< boolean >();
				initialUserIds.forEach( userId => {
					if ( isPositiveInteger( userId ) ) {
						allUserIds.set( userId.toString(), true );
					}
				} );
				this.set( 'allUserIds', allUserIds );

				// Initialize activeUserIds map.
				const activeUserIds = new Y.Map< boolean >();
				this.set( 'activeUserIds', activeUserIds );

				this.logger.info( 'Session stats initialized', this.sessionMap.toJSON() );
				initialized = true;
			}, SESSION_STATS_ORIGIN );
		} catch ( error ) {
			this.logger.debug( 'Failed to initialize session stats', error );
		}

		return initialized;
	}

	/**
	 * Exports the current session statistics and resets tracking state.
	 *
	 * @returns SessionStats object or null if stats are invalid or not being recorded
	 */
	public exportStats(): SessionStatsExport | null {
		let sessionStats: SessionStatsExport | null = null;

		this.awareness.doc.transact( () => {
			if ( ! this.isRecordingStats() ) {
				return;
			}

			// Mark as not recording to claim the export operation.
			this.set( 'isRecordingStats', false );

			try {
				sessionStats = {
					expiredByInactivity: this.isSessionExpired(),
					postId: this.getCurrentPostId(),
					sessionDuration: this.getSessionDuration(),
					timestamp: Date.now(),
					usersActive: this.getActiveUserCount(),
					usersInactive: this.getInactiveUserCount(),
					usersTotal: this.getTotalUserCount(),
				};

				// Reset after successful data collection.
				this.delete( 'activeUserIds' );
				this.delete( 'allUserIds' );
				this.set( 'sessionInitializerClientId', null );
				this.set( 'sessionTimeLastActivity', null );
				this.set( 'sessionTimeStart', null );
			} catch ( error ) {
				this.logger.debug( 'Failed to export session data', error );

				// Mark as recording so export can be retried.
				this.set( 'isRecordingStats', true );
				sessionStats = null;
			}
		}, SESSION_STATS_ORIGIN );

		return sessionStats;
	}

	/**
	 * Returns whether the current client is the one coordinating shared state
	 * updates.
	 *
	 * Uses the lowest client ID among connected clients to prevent write conflicts
	 * when multiple clients attempt to update shared state simultaneously.
	 *
	 * @returns True if the current client is the state coordinator, false otherwise
	 */
	private isStateCoordinator(): boolean {
		const connectedClientIds = Array.from( this.awareness.getStates().keys() );

		if ( 0 === connectedClientIds.length ) {
			return false;
		}

		const lowestClientId = Math.min( ...connectedClientIds );
		return this.awareness.clientID === lowestClientId;
	}

	/**
	 * Returns whether the current client owns the session lifecycle.
	 *
	 * The session owner is responsible for initializing and logging the session.
	 * Ownership is sticky: the client that initialized the session remains the
	 * owner as long as they're connected. If they disconnect, ownership falls
	 * back to the lowest connected client ID.
	 *
	 * @returns True if the current client is the session owner, false otherwise
	 */
	public isSessionOwner(): boolean {
		const initializerId = this.getSessionInitializerClientId();

		// If there's a session owner and they're still connected, only they can act.
		if ( initializerId !== null ) {
			const isInitializerConnected = this.awareness.getStates().has( initializerId );

			if ( isInitializerConnected ) {
				return this.awareness.clientID === initializerId;
			}
		}

		// No owner, or the owner has disconnected; use state coordinator logic.
		return this.isStateCoordinator();
	}

	/**
	 * Adds multiple user IDs to the shared allUserIds map.
	 *
	 * @param userIds Array of WordPress user IDs to add
	 */
	public addUsersToAllUsers( userIds: number[] ): void {
		if ( ! Array.isArray( userIds ) || 0 === userIds.length ) {
			return;
		}

		const allUserIds = this.getAllUserIds();
		if ( ! allUserIds ) {
			this.logger.debug( 'allUserIds is not initialized' );

			return;
		}

		// Determine existing user IDs.
		const existingKeys = new Set< string >();
		for ( const key of allUserIds.keys() ) {
			existingKeys.add( key );
		}

		// Determine new User IDs.
		const newIds: number[] = [];
		for ( const id of userIds ) {
			if ( ! isPositiveInteger( id ) ) {
				continue;
			}
			const key = id.toString();
			if ( ! existingKeys.has( key ) ) {
				newIds.push( id );
			}
		}

		// Avoid writing if there are no new user IDs.
		if ( 0 === newIds.length ) {
			return;
		}

		// Add all new user IDs using a single transaction.
		this.awareness.doc.transact( () => {
			for ( const id of newIds ) {
				allUserIds.set( id.toString(), true );
			}
		}, SESSION_STATS_ORIGIN );
	}

	/**
	 * Adds a user ID to the shared activeUserIds map.
	 *
	 * @param userId The WordPress user ID to add
	 */
	public addUserToActiveUsers( userId: number ): void {
		if ( ! isPositiveInteger( userId ) ) {
			return;
		}

		const activeUserIds = this.getActiveUserIds();
		if ( ! activeUserIds ) {
			this.logger.debug( 'activeUserIds is not initialized' );

			return;
		}

		const key = userId.toString();

		// Avoid writing if the user ID is already present.
		const existing = activeUserIds.get( key );
		if ( existing !== undefined ) {
			return;
		}

		this.awareness.doc.transact( () => {
			activeUserIds.set( key, true );
		}, SESSION_STATS_ORIGIN );
	}
}
