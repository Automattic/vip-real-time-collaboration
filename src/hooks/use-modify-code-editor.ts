/**
 * WordPress dependencies
 */
import { store as coreDataStore, type CoreDataSelectors } from '@wordpress/core-data';
import { useSelect } from '@wordpress/data';
import { store as editPostStore, type EditPostStoreSelectors } from '@wordpress/edit-post';
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
 * Custom hook that manages read-only state for the code editor.
 * Makes the code editor textarea read-only when in view mode.
 */
export function useModifyCodeEditor() {
	// Get the current editor mode (visual or text).
	// Visual mode is the default block editor mode.
	// Text mode is the code editor mode.
	const editorMode = useSelect< EditPostStoreSelectors, 'visual' | 'text' | undefined >( select =>
		select( editPostStore ).getEditorMode()
	);

	// Get the current collaboration mode (view or edit).
	const currentCollaborationEditorMode = useSelect< CoreDataSelectors, 'view' | 'edit' >( select =>
		select( coreDataStore ).getCollaboratorMode()
	);

	// Check if the Collaboration Mode Picker setting is enabled.
	// TODO: Delete this once we complete the feature.
	const isCollaborationModeEnabled = useSelect< SettingsStoreSelectors, boolean >( select =>
		select( rtcSettingsStore ).getSetting( Setting.COLLABORATION_MODE_PICKER )
	);

	// The code editor is set to read-only in the following cases:
	// 1. When the editor is in text mode.
	// 2. When the Collaboration Mode Picker is enabled and the current mode is View.
	// TODO: Remove the Collaboration mode enabled check once we complete the feature.
	const shouldCodeEditorBeReadOnly =
		editorMode === 'text' &&
		( ! isCollaborationModeEnabled || currentCollaborationEditorMode === 'view' );

	// Manage code editor read-only state.
	useEffect( () => {
		const editorPostTextEditorElement = document.querySelector( '.editor-post-text-editor' );
		const editorTitleTextEditorElement = document.querySelector(
			'.components-textarea-control__input'
		);

		// Set or remove the readOnly attribute on the code editor textarea based on the current mode.
		if (
			editorPostTextEditorElement instanceof HTMLTextAreaElement &&
			editorTitleTextEditorElement instanceof HTMLTextAreaElement
		) {
			editorPostTextEditorElement.readOnly = shouldCodeEditorBeReadOnly;
			editorTitleTextEditorElement.readOnly = shouldCodeEditorBeReadOnly;
		}
	}, [ shouldCodeEditorBeReadOnly ] );
}
