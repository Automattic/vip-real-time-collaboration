import { dispatch, useSelect } from '@wordpress/data';
import { useEffect, useRef } from '@wordpress/element';
import { store as noticesStore } from '@wordpress/notices';

import {
	AwarenessStoreSelectors,
	UserState,
	store as awarenessStore,
} from '@/store/awareness-store';
import { SettingsStoreSelectors } from '@/store/settings-store';

/**
 * Custom hook to show notifications when users join or leave the post.
 * Notifications are shown based on the settings configured by the user.
 */
export function useCollaboratorActivityNotifications() {
	// Get notification settings from the store.
	const {
		isNotificationsForCollaboratorJoiningEnabled,
		isNotificationsForCollaboratorLeavingEnabled,
	} = useSelect<
		SettingsStoreSelectors,
		{
			isNotificationsForCollaboratorJoiningEnabled: boolean;
			isNotificationsForCollaboratorLeavingEnabled: boolean;
		}
	>( select => {
		return {
			isNotificationsForCollaboratorJoiningEnabled: select(
				'vip-real-time-collaboration/settings'
			).isNotificationsForCollaboratorJoiningEnabled(),
			isNotificationsForCollaboratorLeavingEnabled: select(
				'vip-real-time-collaboration/settings'
			).isNotificationsForCollaboratorLeavingEnabled(),
		};
	} );

	// Get the list of active users from the awareness store.
	const activeUsers = useSelect< AwarenessStoreSelectors, Map< number, UserState > >( select => {
		return select( awarenessStore ).getActiveUsers();
	} );

	sendPresenceNotifications(
		activeUsers,
		isNotificationsForCollaboratorJoiningEnabled,
		isNotificationsForCollaboratorLeavingEnabled
	);
}

function sendPresenceNotifications(
	activeUsers: Map< number, UserState >,
	isNotificationsForCollaboratorJoiningEnabled: boolean,
	isNotificationsForCollaboratorLeavingEnabled: boolean
) {
	// Ref to keep track of the initial users, for comparison on subsequent renders.
	const initialUsers = useRef( new Map() as Map< number, UserState > );

	// Effect to show notifications when users join or leave.
	useEffect( () => {
		// If both notifications are disabled, do nothing.
		if (
			! isNotificationsForCollaboratorJoiningEnabled &&
			! isNotificationsForCollaboratorLeavingEnabled
		) {
			return;
		}

		const { createNotice } = dispatch( noticesStore );

		// Show notification for users who have joined.
		if ( isNotificationsForCollaboratorJoiningEnabled ) {
			activeUsers.forEach( ( user, id ) => {
				if ( ! initialUsers.current.has( id ) && ! user.isMe && initialUsers.current.size > 0 ) {
					void createNotice( 'info', `${ user.name } has joined.`, {
						id: `rtc-user-joined-${ id }`,
						isDismissible: false,
						type: 'snackbar',
					} );
				}
			} );
		}

		// Show notification for users who have left.
		if ( isNotificationsForCollaboratorLeavingEnabled ) {
			initialUsers.current.forEach( ( user, id ) => {
				if ( ! activeUsers.has( id ) && ! user.isMe && activeUsers.size > 0 ) {
					void createNotice( 'info', `${ user.name } has left.`, {
						id: `rtc-user-left-${ id }`,
						isDismissible: false,
						type: 'snackbar',
					} );
				}
			} );
		}

		// Update the initial users ref for the next comparison.
		initialUsers.current = new Map( activeUsers );
	}, [
		activeUsers,
		isNotificationsForCollaboratorJoiningEnabled,
		isNotificationsForCollaboratorLeavingEnabled,
	] );
}
