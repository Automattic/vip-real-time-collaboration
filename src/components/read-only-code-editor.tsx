/**
 * WordPress dependencies
 */
import { useSelect } from '@wordpress/data';
import { store as editPostStore, type EditPostStoreSelectors } from '@wordpress/edit-post';
import { useEffect } from '@wordpress/element';

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

function isTextAreaElement( element: Element | null ): element is HTMLTextAreaElement {
	return element?.matches( 'textarea' ) ?? false;
}

export function ReadOnlyCodeEditor() {
	// Get the current editor mode (visual or text).
	// Visual mode is the default block editor mode.
	// Text mode is the code editor mode.
	const editorMode = useSelect< EditPostStoreSelectors, 'visual' | 'text' | undefined >( select =>
		select( editPostStore ).getEditorMode()
	);

	// Check if the Collaboration Mode Picker setting is enabled.
	// ToDo: Delete this once we complete the feature.
	const isCollaborationModeEnabled = useSelect< SettingsStoreSelectors, boolean >( select =>
		select( rtcSettingsStore ).getSetting( Setting.COLLABORATION_MODE_PICKER )
	);

	// Get the current collaboration mode (view or edit).
	const collaborationMode = useSelect< CollaborationModeStoreSelectors, CollaborationMode >(
		select => select( CollaborationModeStore ).getMode()
	);

	// The code editor is set to read-only in the following cases:
	// 1. When the editor is in text mode.
	// 2. When the Collaboration Mode Picker is enabled and the current mode is View.
	// ToDo: Remove the Collaboration mode enabled check once we complete the feature.
	const shouldCodeEditorBeReadOnly =
		editorMode === 'text' &&
		( ! isCollaborationModeEnabled || collaborationMode === CollaborationMode.VIEW );

	useEffect( () => {
		const editorPostTextEditorElement = document.querySelector( '.editor-post-text-editor' );

		// Set or remove the readOnly attribute on the code editor textarea based on the current mode.
		if ( isTextAreaElement( editorPostTextEditorElement ) ) {
			editorPostTextEditorElement.readOnly = shouldCodeEditorBeReadOnly;
		}
	}, [ shouldCodeEditorBeReadOnly ] );

	return null;
}
