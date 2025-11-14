/**
 * WordPress dependencies
 */
import { useBlockEditingMode } from '@wordpress/block-editor';
import { createHigherOrderComponent } from '@wordpress/compose';
import { useSelect } from '@wordpress/data';
import { addFilter } from '@wordpress/hooks';

import {
	type AwarenessStoreSelectors,
	type UserState,
	store as awarenessStore,
} from '@/store/awareness-store';
import {
	type CollaborationModeStoreSelectors,
	store as CollaborationModeStore,
} from '@/store/collaboration-mode-store';
import {
	Setting,
	store as rtcSettingsStore,
	type SettingsStoreSelectors,
} from '@/store/settings-store';
import { CollaborationMode } from '@/types/collaboration-mode';
import { NotificationType, sendNotification } from '@/utilities/notifications';

export function setupViewOnlyMode() {
	const viewOnlyMode = createHigherOrderComponent( BlockEdit => {
		return props => {
			// Check if the Collaboration Mode Picker setting is enabled.
			// ToDo: Delete this once we complete the feature.
			const isCollaborationModeEnabled = useSelect< SettingsStoreSelectors, boolean >( select =>
				select( rtcSettingsStore ).getSetting( Setting.COLLABORATION_MODE_PICKER )
			);

			// Get the current collaboration mode (view or edit).
			const collaborationMode = useSelect< CollaborationModeStoreSelectors, CollaborationMode >(
				select => select( CollaborationModeStore ).getMode()
			);

			const currentUserInfo = useSelect< AwarenessStoreSelectors, UserState | undefined >(
				select => {
					const activeUsers = Array.from( select( awarenessStore ).getActiveUsers().values() );
					return activeUsers.find( userState => userState.userInfo.isMe );
				}
			);

			// ToDo: Remove the Collaboration mode enabled check once we complete the feature.
			if (
				isCollaborationModeEnabled &&
				collaborationMode === CollaborationMode.VIEW &&
				currentUserInfo
			) {
				useBlockEditingMode( 'disabled' );
				sendNotification( NotificationType.ViewOnlyMode, currentUserInfo.userInfo );
			} else {
				useBlockEditingMode( 'default' );
			}

			return <BlockEdit { ...props } />;
		};
	}, 'viewOnlyMode' );

	addFilter( 'editor.BlockEdit', 'vip-rtc-view-only-mode', viewOnlyMode );
}
