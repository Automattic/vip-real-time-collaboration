import { User, store as coreStore, CoreDataSelectors } from '@wordpress/core-data';
import { useSelect } from '@wordpress/data';

import { store as awarenessStore, AwarenessStoreSelectors } from '../store/awareness-store';

import './awareness-avatars.scss';

export function AwarenessAvatars() {
	const activeUsers = useSelect< AwarenessStoreSelectors, User[] >( select => {
		return select( awarenessStore ).getActiveUsers();
	} );

	const currentUser = useSelect< CoreDataSelectors, User >( select => {
		return select( coreStore ).getCurrentUser();
	} );

	const otherUsers = activeUsers.filter( user => user.id !== currentUser?.id );
	const allUsers = [ currentUser, ...otherUsers ];

	if ( allUsers.length <= 1 ) {
		// Hide avatars when there's only one user.
		// This also avoids showing a single user when navigating away from the editor
		// after the connection is closed but before the page reloads.
		return null;
	}

	const visibleUsers = allUsers.slice( 0, 3 );
	const remainingUsers = allUsers.slice( 3 );

	return (
		<div className="vip-realtime-collaboration-avatars">
			{ visibleUsers.map( user => (
				<div key={ user.id } className="vip-realtime-collaboration-avatar">
					<Avatar user={ user } />
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

function Avatar( { user }: { user: User } ) {
	const avatarUrl = user.avatar_urls[ 24 ] || user.avatar_urls[ 48 ] || user.avatar_urls[ 96 ];

	return <img src={ avatarUrl } alt={ user.name } />;
}
