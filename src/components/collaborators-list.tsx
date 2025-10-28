import { Popover } from '@wordpress/components';

import { Avatar } from '@/components/avatar';
import { type UserState } from '@/store/awareness-store';

import '@/components/collaborators-list.scss';

interface CollaboratorsListProps {
	activeUsers: UserState[];
}

/**
 * Renders a list showing all active collaborators with their details.
 */
export function CollaboratorsList( { activeUsers }: CollaboratorsListProps ) {
	return (
		<Popover
			placement="bottom-start"
			noArrow={ false }
			offset={ 8 }
			className="vip-real-time-collaboration-collaborators-list"
		>
			<div className="vip-real-time-collaboration-collaborators-list-content">
				<div className="vip-real-time-collaboration-collaborators-list-header">
					{ activeUsers.length } ACTIVE COLLABORATOR{ activeUsers.length !== 1 ? 'S' : '' }
				</div>
				<div className="vip-real-time-collaboration-collaborators-list-items">
					{ activeUsers.map( userState => (
						<div
							key={ userState.userInfo.clientId }
							className="vip-real-time-collaboration-collaborators-list-item"
						>
							<Avatar userInfo={ userState.userInfo } showUserColorBorder={ true } />
							<div className="vip-real-time-collaboration-collaborators-list-item-info">
								<div className="vip-real-time-collaboration-collaborators-list-item-name">
									{ userState.userInfo.name }
								</div>
								<div className="vip-real-time-collaboration-collaborators-list-item-email">
									{ userState.userInfo.name.toLowerCase().replace( ' ', '.' ) }@news.com
								</div>
							</div>
						</div>
					) ) }
				</div>
			</div>
		</Popover>
	);
}
