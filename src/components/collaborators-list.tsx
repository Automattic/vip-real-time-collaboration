import { Popover, Button } from '@wordpress/components';
import { close } from '@wordpress/icons';

import { Avatar } from '@/components/avatar';
import { type UserState } from '@/store/awareness-store';

import '@/components/collaborators-list.scss';

interface CollaboratorsListProps {
	activeUsers: UserState[];
	popoverAnchor?: HTMLElement | null;
	setIsPopoverVisible: ( isVisible: boolean ) => void;
}

/**
 * Renders a list showing all active collaborators with their details.
 */
export function CollaboratorsList( {
	activeUsers,
	popoverAnchor,
	setIsPopoverVisible,
}: CollaboratorsListProps ) {
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
							style={ { opacity: userState.userInfo.isConnected ? 1 : 0.5 } }
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
