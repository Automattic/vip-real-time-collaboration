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
export function usePostNotifications() {
	// Get notification settings from the store.
	const { isNotificationsForJoinEnabled, isNotificationsForLeaveEnabled } = useSelect<
		SettingsStoreSelectors,
		{ isNotificationsForJoinEnabled: boolean; isNotificationsForLeaveEnabled: boolean }
	>( select => {
		return {
			isNotificationsForJoinEnabled: select(
				'vip-real-time-collaboration/settings'
			).isNotificationsForJoinEnabled(),
			isNotificationsForLeaveEnabled: select(
				'vip-real-time-collaboration/settings'
			).isNotificationsForLeaveEnabled(),
		};
	} );

	// If both notifications are disabled, do nothing.
	if ( ! isNotificationsForJoinEnabled && ! isNotificationsForLeaveEnabled ) {
		return;
	}

	// Get the list of active users from the awareness store.
	const activeUsers = useSelect< AwarenessStoreSelectors, Map< number, UserState > >( select => {
		return select( awarenessStore ).getActiveUsers();
	} );

	// Ref to keep track of the initial users, for comparison on subsequent renders.
	const initialUsers = useRef( new Map() as Map< number, UserState > );

	// Effect to show notifications when users join or leave.
	useEffect( () => {
		const { createNotice } = dispatch( noticesStore );

		// Show notification for users who have joined.
		if ( isNotificationsForJoinEnabled ) {
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
		if ( isNotificationsForLeaveEnabled ) {
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
	}, [ activeUsers, isNotificationsForJoinEnabled, isNotificationsForLeaveEnabled ] );
}
