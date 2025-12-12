import { Button } from '@wordpress/components';
import { useState } from '@wordpress/element';

import { Avatar } from '@/components/avatar';
import { CollaboratorsList } from '@/components/collaborators-list';
import { useActiveUsers } from '@/hooks/use-post-editor-awareness-state';
import { type CursorRegistry } from '@/utilities/cursor-registry';

import '@/components/avatars.scss';

interface AvatarsProps {
	cursorRegistry: CursorRegistry;
}

/**
 * Renders a list of avatars for the active users, with a maximum of 3 visible avatars.
 * Shows a popover with all users on hover.
 */
export function Avatars( { cursorRegistry }: AvatarsProps ) {
	const activeUsers = useActiveUsers();

	// Filter out current user - we never show ourselves in the list
	const otherActiveUsers = activeUsers.filter( user => ! user.isMe );

	const [ isPopoverVisible, setIsPopoverVisible ] = useState( false );
	const [ popoverAnchor, setPopoverAnchor ] = useState< HTMLElement | null >( null );

	if ( otherActiveUsers.length === 0 ) {
		// Hide avatars when there are no other users
		return null;
	}

	const visibleUsers = otherActiveUsers.slice( 0, 3 );
	const remainingUsers = otherActiveUsers.slice( 3 );
	const remainingUsersText = remainingUsers.map( ( { userInfo } ) => userInfo.name ).join( ', ' );

	return visibleUsers.length > 0 ? (
		<>
			<Button
				className="vip-real-time-collaboration-avatars-container"
				onClick={ () => setIsPopoverVisible( ! isPopoverVisible ) }
				isPressed={ isPopoverVisible }
				ref={ setPopoverAnchor }
				aria-label={ `Collaborators list, ${ otherActiveUsers.length } online` }
			>
				{ visibleUsers.map( userState => (
					<Avatar
						key={ userState.clientId }
						userInfo={ userState.userInfo }
						showUserColorBorder={ false }
						size="small"
					/>
				) ) }

				{ remainingUsers.length > 0 && (
					<div
						className="vip-real-time-collaboration-avatar-remaining"
						title={ remainingUsersText }
					>
						+{ remainingUsers.length }
					</div>
				) }
			</Button>
			{ isPopoverVisible && (
				<CollaboratorsList
					activeUsers={ otherActiveUsers }
					cursorRegistry={ cursorRegistry }
					popoverAnchor={ popoverAnchor }
					setIsPopoverVisible={ setIsPopoverVisible }
				/>
			) }
		</>
	) : null;
}
