import { Button } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { useState } from '@wordpress/element';

import { Avatar } from '@/components/avatar';
import { CollaboratorsList } from '@/components/collaborators-list';
import { useSortedAwarenessUsers } from '@/hooks/use-sorted-awareness-users';
import {
	store as rtcSettingsStore,
	Setting,
	type SettingsStoreSelectors,
} from '@/store/settings-store';

import '@/components/avatars.scss';

/**
 * Renders a list of avatars for the active users, with a maximum of 3 visible avatars.
 * Shows a popover with all users on hover.
 */
export function Avatars() {
	const activeUsers = useSortedAwarenessUsers();
	const isSelfAwarenessEnabled = useSelect< SettingsStoreSelectors, boolean >(
		select => select( rtcSettingsStore ).getSetting( Setting.SELF_AWARENESS ),
		[]
	);

	const [ isPopoverVisible, setIsPopoverVisible ] = useState( false );

	if ( activeUsers.length <= 1 && ! isSelfAwarenessEnabled ) {
		// Hide avatars when there's only one user.
		// This also avoids showing a single user when navigating away from the editor
		// after the connection is closed but before the page reloads.
		return null;
	}

	const visibleUsers = activeUsers.slice( 0, 3 );
	const remainingUsers = activeUsers.slice( 3 );
	const remainingUsersText = remainingUsers.map( ( { userInfo } ) => userInfo.name ).join( ', ' );

	return visibleUsers.length > 1 ? (
		<Button
			className="vip-real-time-collaboration-avatars-container"
			onClick={ () => setIsPopoverVisible( ! isPopoverVisible ) }
			isPressed={ isPopoverVisible }
		>
			{ visibleUsers.map( userState => (
				<Avatar
					key={ userState.userInfo.clientId }
					userInfo={ userState.userInfo }
					showUserColorBorder={ false }
					size="small"
				/>
			) ) }

			{ remainingUsers.length > 0 && (
				<div className="vip-real-time-collaboration-avatar-remaining" title={ remainingUsersText }>
					+{ remainingUsers.length }
				</div>
			) }

			{ isPopoverVisible && <CollaboratorsList activeUsers={ activeUsers } /> }
		</Button>
	) : null;
}
