import { useSelect } from '@wordpress/data';

import { Avatar } from '@/components/avatar';
import { useSortedAwarenessUsers } from '@/hooks/use-sorted-awareness-users';
import {
	store as rtcSettingsStore,
	Setting,
	type SettingsStoreSelectors,
} from '@/store/settings-store';

/**
 * Renders a list of avatars for the active users, with a maximum of 3 visible avatars.
 */
export function Avatars() {
	const activeUsers = useSortedAwarenessUsers();
	const isSelfAwarenessEnabled = useSelect< SettingsStoreSelectors, boolean >(
		select => select( rtcSettingsStore ).getSetting( Setting.SELF_AWARENESS ),
		[]
	);

	if ( activeUsers.length <= 1 && ! isSelfAwarenessEnabled ) {
		// Hide avatars when there's only one user.
		// This also avoids showing a single user when navigating away from the editor
		// after the connection is closed but before the page reloads.
		return null;
	}

	const visibleUsers = activeUsers.slice( 0, 3 );
	const remainingUsers = activeUsers.slice( 3 );
	const remainingUsersText = remainingUsers.map( userState => userState.name ).join( ', ' );

	return visibleUsers.length > 1 ? (
		<>
			{ visibleUsers.map( userState => (
				<Avatar key={ userState.clientId } userState={ userState } showUserColorBorder={ false } />
			) ) }

			{ remainingUsers.length > 0 && (
				<div className="vip-real-time-collaboration-avatar-remaining" title={ remainingUsersText }>
					+{ remainingUsers.length }
				</div>
			) }
		</>
	) : null;
}
