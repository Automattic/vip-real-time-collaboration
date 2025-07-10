import { User, store as coreStore } from '@wordpress/core-data';
import { useSelect } from '@wordpress/data';

import { store as awarenessStore } from '../store/awareness-store';

import './awareness-avatars.scss';

export function AwarenessAvatars() {
	const activeUsers = useSelect( select => {
		const store = select( awarenessStore );

		return store.getActiveUsers();
	}, [] );

	const currentUser = useSelect( select => {
		const store = select( coreStore );
		return store.getCurrentUser();
	}, [] );

	const sortedOtherUsers = activeUsers
		.filter( user => user.id !== currentUser?.id )
		.sort( ( userA, userB ) => userA.id - userB.id );
	const sortedUsers = [ currentUser, ...sortedOtherUsers ];

	const visibleUsers = sortedUsers.slice( 0, 3 );
	const remainingUsers = sortedUsers.slice( 3 );

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
