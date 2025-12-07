/**
 * WordPress dependencies
 */
import { useSelect } from '@wordpress/data';
import { store as editorStore, type EditorStoreSelectors } from '@wordpress/editor';
import { useEffect } from '@wordpress/element';

/**
 * Internal dependencies
 */
import {
	Setting,
	store as rtcSettingsStore,
	type SettingsStoreSelectors,
} from '@/store/settings-store';

/**
 * Custom hook that disables sidebar interaction when in view mode.
 */
export function useDisableSidebarInteraction() {
	// Get the current collaboration mode (view or edit).
	const currentCollaborationEditorMode = useSelect< EditorStoreSelectors, 'view' | 'edit' >(
		select => select( editorStore ).getCollaboratorMode()
	);

	// Check if the Collaboration Mode Picker setting is enabled.
	// TODO: Delete this once we complete the feature.
	const isCollaborationModeEnabled = useSelect< SettingsStoreSelectors, boolean >( select =>
		select( rtcSettingsStore ).getSetting( Setting.COLLABORATION_MODE_PICKER )
	);

	const shouldSidebarBeReadOnly =
		isCollaborationModeEnabled && currentCollaborationEditorMode === 'view';

	useEffect( () => {
		// Disable sidebar interaction.
		const sidebarElement = document.querySelector( '.editor-sidebar' );
		if ( sidebarElement instanceof HTMLDivElement ) {
			sidebarElement.style.pointerEvents = shouldSidebarBeReadOnly ? 'none' : 'auto';
		}

		// Disable header settings interaction - publish button, etc.
		const headerSettingsElement = document.querySelector( '.editor-header__settings' );
		if ( headerSettingsElement instanceof HTMLDivElement ) {
			headerSettingsElement.style.pointerEvents = shouldSidebarBeReadOnly ? 'none' : 'auto';
		}

		// Disable undo buttons interaction.
		const undoElement = document.querySelector( '.editor-history__undo' );
		if ( undoElement instanceof HTMLButtonElement ) {
			undoElement.style.pointerEvents = shouldSidebarBeReadOnly ? 'none' : 'auto';
		}

		// Disable redo buttons interaction.
		const redoElement = document.querySelector( '.editor-history__redo' );
		if ( redoElement instanceof HTMLButtonElement ) {
			redoElement.style.pointerEvents = shouldSidebarBeReadOnly ? 'none' : 'auto';
		}
	}, [ shouldSidebarBeReadOnly ] );
}
