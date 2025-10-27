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
	const activeUsers = useSelect< AwarenessStoreSelectors, Map< number, UserState > >( select => {
		return select( awarenessStore ).getActiveUsers();
	} );

	return useMemo( () => {
		return Array.from( activeUsers.values() ).sort( ( user1: UserState, user2: UserState ) => {
			if ( user1.userInfo.isMe && ! user2.userInfo.isMe ) {
				return -1;
			}
			if ( ! user1.userInfo.isMe && user2.userInfo.isMe ) {
				return 1;
			}
			return 0;
		} );
	}, [ activeUsers ] );
}
