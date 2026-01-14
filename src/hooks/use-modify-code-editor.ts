/**
 * WordPress dependencies
 */
import { useSelect } from '@wordpress/data';
import { store as editPostStore, type EditPostStoreSelectors } from '@wordpress/edit-post';
import { useEffect } from '@wordpress/element';

/**
 * Custom hook that manages read-only state for the code editor.
 * Makes the code editor textarea read-only by default.
 */
export function useModifyCodeEditor() {
	// Get the current editor mode (visual or text).
	// Visual mode is the default block editor mode.
	// Text mode is the code editor mode.
	const editorMode = useSelect< EditPostStoreSelectors, 'visual' | 'text' | undefined >( select =>
		select( editPostStore ).getEditorMode()
	);

	useEffect( () => {
		if ( editorMode === 'text' ) {
			const editorPostTextEditorElement = document.querySelector( '.editor-post-text-editor' );
			const editorTitleTextEditorElement = document.querySelector(
				'.components-textarea-control__input'
			);

			if (
				editorPostTextEditorElement instanceof HTMLTextAreaElement &&
				editorTitleTextEditorElement instanceof HTMLTextAreaElement
			) {
				editorPostTextEditorElement.readOnly = true;
				editorTitleTextEditorElement.readOnly = true;
			}
		}
	}, [ editorMode ] );
}
