/**
 * External dependencies
 */
import { select } from '@wordpress/data';

/**
 * Internal dependencies
 */
import { store as awarenessStore, UserState } from '@/store/awareness-store';

/**
 * Validates whether a value is a positive integer.
 *
 * @param value The value to validate
 * @returns True if the value is a positive integer, false otherwise
 */
export function isPositiveInteger( value: unknown ): value is number {
	return Number.isInteger( value ) && ( value as number ) > 0;
}

/**
 * Validates whether a user state represents a connected user.
 *
 * Filters out users who are marked as disconnected. This is useful for
 * respecting the grace period for reconnections (REMOVAL_DELAY_IN_MS),
 * where users marked as disconnected remain in the awareness store temporarily.
 *
 * @param userState The user state to validate
 * @returns True if the user is connected (or connection status is not explicitly false)
 */
export function isUserConnected( userState: UserState ): boolean {
	return userState?.userInfo?.isConnected !== false;
}

/**
 * Extracts unique user IDs from connected users in the awareness store.
 *
 * Filters out disconnected users and returns only valid positive integer user IDs.
 *
 * @returns Array of unique connected user IDs
 */
export function getConnectedUserIds(): number[] {
	try {
		const { getActiveUsers } = select( awarenessStore );

		return Array.from(
			new Set(
				Array.from( getActiveUsers().values() )
					.filter( isUserConnected )
					.map( ( u: UserState ) => u?.userInfo?.id )
					.filter( isPositiveInteger )
			)
		);
	} catch ( error ) {
		return [];
	}
}

/**
 * Compares two sets of user IDs for equality.
 *
 * @param set1 First set of user IDs
 * @param set2 Second set of user IDs
 * @returns True if both sets contain the same user IDs, false otherwise
 */
export function areUserSetsEqual( set1: Set< number >, set2: Set< number > ): boolean {
	if ( set1.size !== set2.size ) {
		return false;
	}
	for ( const id of set1 ) {
		if ( ! set2.has( id ) ) {
			return false;
		}
	}

	return true;
}

/**
 * Returns the current unique user count using the awareness store.
 */
export function getConnectedUserCount(): number {
	return getConnectedUserIds().length;
}
