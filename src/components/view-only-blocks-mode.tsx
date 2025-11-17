/**
 * WordPress dependencies
 */
import { useBlockEditingMode } from '@wordpress/block-editor';
import { createHigherOrderComponent } from '@wordpress/compose';
import { useSelect } from '@wordpress/data';
import { useEffect } from '@wordpress/element';
import { addFilter, removeFilter } from '@wordpress/hooks';

/**
 * Internal dependencies
 */
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

const FILTER_HOOK = 'blockEditor.__unstableCanInsertBlockType';
const FILTER_NAME = 'vip-rtc/disable-block-insertion';

/**
 * Sets up the view only mode by modifying the edit function of a block,
 * to disable editing entirely if view mode is enabled.
 */
export function setupViewOnlyMode() {
	const viewOnlyMode = createHigherOrderComponent( BlockEdit => {
		return props => {
			// Check if the Collaboration Mode Picker setting is enabled.
			// TODO: Delete this once we complete the feature.
			const isCollaborationModeEnabled = useSelect< SettingsStoreSelectors, boolean >( select =>
				select( rtcSettingsStore ).getSetting( Setting.COLLABORATION_MODE_PICKER )
			);

			// Get the current collaboration mode (view or edit).
			const collaborationMode = useSelect< CollaborationModeStoreSelectors, CollaborationMode >(
				select => select( CollaborationModeStore ).getMode()
			);

			// Get the current user's information from the awareness store.
			const currentUserInfo = useSelect< AwarenessStoreSelectors, UserState | undefined >(
				select => {
					const activeUsers = Array.from( select( awarenessStore ).getActiveUsers().values() );
					return activeUsers.find( userState => userState.userInfo.isMe );
				}
			);

			// Determine if view-only mode should be active.
			// TODO: Remove the Collaboration mode enabled check once we complete the feature.
			const isViewOnlyActive =
				isCollaborationModeEnabled &&
				collaborationMode === CollaborationMode.VIEW &&
				currentUserInfo;

			// Set the block editing mode based on whether view-only is active.
			// This hook must be called unconditionally to follow the Rules of Hooks.
			useBlockEditingMode( isViewOnlyActive ? 'disabled' : 'default' );

			// Manage the block insertion filter to prevent adding new blocks in view-only mode.
			useEffect( () => {
				if ( isViewOnlyActive ) {
					// Prevent inserting new blocks.
					// TODO: There's a UI bug where it doesn't filter what's shown in the inserter,
					// but still prevents insertion.
					addFilter( FILTER_HOOK, FILTER_NAME, () => false );
				}

				// Cleanup: Remove the filter when the mode changes or component unmounts.
				// This ensures no memory leaks and proper cleanup.
				return () => {
					removeFilter( FILTER_HOOK, FILTER_NAME );
				};
			}, [ isViewOnlyActive ] );

			return <BlockEdit { ...props } />;
		};
	}, 'viewOnlyMode' );

	addFilter( 'editor.BlockEdit', 'vip-rtc/view-only-mode', viewOnlyMode );
}
