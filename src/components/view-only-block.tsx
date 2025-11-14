/**
 * WordPress dependencies
 */
import { useBlockEditingMode } from '@wordpress/block-editor';
import { createHigherOrderComponent } from '@wordpress/compose';
import { useSelect } from '@wordpress/data';
import { addFilter } from '@wordpress/hooks';

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

export function setupViewOnlyBlocks() {
	const viewOnlyBlocks = createHigherOrderComponent( BlockEdit => {
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

			// ToDo: Remove the Collaboration mode enabled check once we complete the feature.
			if ( isCollaborationModeEnabled && collaborationMode === CollaborationMode.VIEW ) {
				useBlockEditingMode( 'disabled' );
			} else {
				useBlockEditingMode( 'default' );
			}

			return <BlockEdit { ...props } />;
		};
	}, 'viewOnlyBlocks' );

	addFilter( 'editor.BlockEdit', 'vip-rtc-view-only-blocks', viewOnlyBlocks );
}
