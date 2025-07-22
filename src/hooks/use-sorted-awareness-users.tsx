import { CoreDataSelectors, store as coreStore, User } from '@wordpress/core-data';
import { useSelect } from '@wordpress/data';
import { useMemo } from '@wordpress/element';

import {
	AwarenessStoreSelectors,
	UserState,
	store as awarenessStore,
} from '@/store/awareness-store';

/**
 * Selects active users in the awareness store with the current user sorted to the front of the list.
 */
export function useSortedAwarenessUsers(): UserState[] {
	const activeUsers = useSelect< AwarenessStoreSelectors, UserState[] >( select => {
		return select( awarenessStore ).getActiveUsers();
	} );

	const currentUser = useSelect< CoreDataSelectors, User >( select => {
		return select( coreStore ).getCurrentUser();
	} );

	// Only return a new user array if data has changed
	return useMemo( () => {
		const sortedUsers = [ ...activeUsers ];
		const currentUserStateIndex = sortedUsers.findIndex( user => user.id === currentUser?.id );

		if ( currentUserStateIndex >= 0 ) {
			const currentUserState = sortedUsers.splice( currentUserStateIndex, 1 )?.[ 0 ];

			if ( currentUserState ) {
				sortedUsers.unshift( currentUserState );
			}
		}

		return sortedUsers;
	}, [ currentUser, activeUsers ] );
}
