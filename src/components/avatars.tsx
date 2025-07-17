import { Avatar } from './avatar';
import './awareness-avatars.scss';
import { useSortedAwarenessUsers } from '@/hooks/use-sorted-awareness-users';

/**
 * Renders a list of avatars for the active users, with a maximum of 3 visible avatars.
 */
export function AwarenessAvatars() {
	const activeUsers = useSortedAwarenessUsers();

	if ( activeUsers.length <= 1 ) {
		// Hide avatars when there's only one user.
		// This also avoids showing a single user when navigating away from the editor
		// after the connection is closed but before the page reloads.
		return null;
	}

	const visibleUsers = activeUsers.slice( 0, 3 );
	const remainingUsers = activeUsers.slice( 3 );

	return (
		<div className="vip-realtime-collaboration-avatars">
			{ visibleUsers.map( userState => (
				<div key={ userState.id } className="vip-realtime-collaboration-avatar">
					<Avatar userState={ userState } />
				</div>
			) ) }

			{ remainingUsers.length > 0 && (
				<div className="vip-realtime-collaboration-avatar-remaining">
					+{ remainingUsers.length }
				</div>
			) }
		</div>
	);
}
