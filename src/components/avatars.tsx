import { Avatar } from './avatar';
import { useSortedAwarenessUsers } from '@/hooks/use-sorted-awareness-users';

/**
 * Renders a list of avatars for the active users, with a maximum of 3 visible avatars.
 */
export function Avatars() {
	const activeUsers = useSortedAwarenessUsers();

	if ( activeUsers.length <= 1 ) {
		// Hide avatars when there's only one user.
		// This also avoids showing a single user when navigating away from the editor
		// after the connection is closed but before the page reloads.
		return null;
	}

	const visibleUsers = activeUsers.slice( 0, 3 );
	const remainingUsers = activeUsers.slice( 3 );
	const remainingUsersText = remainingUsers.map( userState => userState.name ).join( ', ' );

	return (
		<div className="vip-real-time-collaboration-avatars">
			{ visibleUsers.map( userState => (
				<Avatar key={ userState.clientId } userState={ userState } showUserColorBorder={ true } />
			) ) }

			{ remainingUsers.length > 0 && (
				<div className="vip-real-time-collaboration-avatar-remaining" title={ remainingUsersText }>
					+{ remainingUsers.length }
				</div>
			) }
		</div>
	);
}
