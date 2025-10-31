import { Popover, Button } from '@wordpress/components';
import { close } from '@wordpress/icons';

import { Avatar } from '@/components/avatar';
import { cursorRegistry } from '@/contexts/cursor-registry-context';
import { type UserState } from '@/store/awareness-store';

import '@/components/collaborators-list.scss';

interface CollaboratorsListProps {
	activeUsers: UserState[];
	popoverAnchor?: HTMLElement | null;
	setIsPopoverVisible: ( isVisible: boolean ) => void;
}

/**
 * Renders a list showing all active collaborators with their details.
 * Note: activeUsers should already exclude the current user (filtered by parent component).
 */
export function CollaboratorsList( {
	activeUsers,
	popoverAnchor,
	setIsPopoverVisible,
}: CollaboratorsListProps ) {
	const handleCollaboratorClick = ( clientId: number, isConnected: boolean ) => {
		if ( ! isConnected ) {
			// Don't scroll to disconnected users
			return;
		}

		const success = cursorRegistry.scrollToCursor( clientId, {
			behavior: 'smooth',
			block: 'center',
			highlightDuration: 2000,
		} );

		// Optionally close the popover after successful scroll
		if ( success ) {
			setIsPopoverVisible( false );
		}
	};

	return (
		<Popover
			anchor={ popoverAnchor }
			placement="bottom"
			offset={ 8 }
			className="vip-real-time-collaboration-collaborators-list"
		>
			<div className="vip-real-time-collaboration-collaborators-list-content">
				<div className="vip-real-time-collaboration-collaborators-list-header">
					<div className="vip-real-time-collaboration-collaborators-list-header-title">
						Collaborators
						<span> { activeUsers.length } </span>
					</div>
					<div className="vip-real-time-collaboration-collaborators-list-header-action">
						<Button icon={ close } iconSize={ 16 } onClick={ () => setIsPopoverVisible( false ) } />
					</div>
				</div>
				<div className="vip-real-time-collaboration-collaborators-list-items">
					{ activeUsers.map( userState => (
						<div
							key={ userState.userInfo.clientId }
							className="vip-real-time-collaboration-collaborators-list-item"
							style={ {
								opacity: userState.userInfo.isConnected ? 1 : 0.5,
								cursor: userState.userInfo.isConnected ? 'pointer' : 'default',
							} }
							onClick={ () =>
								handleCollaboratorClick(
									userState.userInfo.clientId,
									userState.userInfo.isConnected
								)
							}
							role="button"
							tabIndex={ 0 }
							onKeyDown={ event => {
								if ( event.key === 'Enter' || event.key === ' ' ) {
									event.preventDefault();
									handleCollaboratorClick(
										userState.userInfo.clientId,
										userState.userInfo.isConnected
									);
								}
							} }
						>
							<Avatar userInfo={ userState.userInfo } showUserColorBorder={ true } size="medium" />
							<div className="vip-real-time-collaboration-collaborators-list-item-info">
								<div className="vip-real-time-collaboration-collaborators-list-item-name">
									{ userState.userInfo.name }
								</div>
								<div className="vip-real-time-collaboration-collaborators-list-item-email">
									{ userState.userInfo.email }
								</div>
							</div>
						</div>
					) ) }
				</div>
			</div>
		</Popover>
	);
}
