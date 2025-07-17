import { CoreDataSelectors, store as coreStore, User } from '@wordpress/core-data';
import { useSelect } from '@wordpress/data';

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

	const currentUserStateIndex = activeUsers.findIndex( user => user.id === currentUser?.id );

	if ( currentUserStateIndex >= 0 ) {
		const currentUserState = activeUsers.splice( currentUserStateIndex, 1 )?.[ 0 ];

		if ( currentUserState ) {
			activeUsers.unshift( currentUserState );
		}
	}

	return activeUsers;
}
