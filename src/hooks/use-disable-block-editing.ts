/**
 * WordPress dependencies
 */
import { useBlockEditingMode } from '@wordpress/block-editor';
import { store as coreStore, type CoreDataSelectors } from '@wordpress/core-data';
import { useSelect } from '@wordpress/data';
import { useEffect } from '@wordpress/element';
import { addFilter, removeFilter } from '@wordpress/hooks';

/**
 * Internal dependencies
 */
import {
	Setting,
	store as rtcSettingsStore,
	type SettingsStoreSelectors,
} from '@/store/settings-store';

const FILTER_HOOK = 'blockEditor.__unstableCanInsertBlockType';
const FILTER_NAME = 'vip-rtc/disable-block-insertion';

/**
 * Custom hook that manages view-only mode for the block editor.
 * Disables block editing and insertion when in view mode.
 */
export function useDisableBlockEditing() {
	// Check if the Collaboration Mode Picker setting is enabled.
	// TODO: Delete this once we complete the feature.
	const isCollaborationModeEnabled = useSelect< SettingsStoreSelectors, boolean >( select =>
		select( rtcSettingsStore ).getSetting( Setting.COLLABORATION_MODE_PICKER )
	);

	// Get the current collaboration mode (view or edit).
	const currentCollaborationEditorMode = useSelect< CoreDataSelectors, 'view' | 'edit' >( select =>
		select( coreStore ).getCollaboratorMode()
	);

	// Determine if view-only mode should be active.
	// TODO: Remove the Collaboration mode enabled check once we complete the feature.
	const isViewOnlyActive = isCollaborationModeEnabled && currentCollaborationEditorMode === 'view';

	// Set the block editing mode based on whether view-only is active.
	// This hook must be called unconditionally to follow the Rules of Hooks.
	useBlockEditingMode( isViewOnlyActive ? 'disabled' : 'default' );

	// Manage the block insertion filter to prevent adding new blocks in view-only mode.
	useEffect( () => {
		if ( isViewOnlyActive ) {
			// Prevent inserting new blocks.
			// Note: The block inserter UI doesn't get updated, but all block insertion is still prevented.
			addFilter( FILTER_HOOK, FILTER_NAME, () => false );
		}

		return () => {
			// Cleanup: Remove the filter when the component unmounts or dependencies change.
			removeFilter( FILTER_HOOK, FILTER_NAME );
		};
	}, [ isViewOnlyActive ] );
}
