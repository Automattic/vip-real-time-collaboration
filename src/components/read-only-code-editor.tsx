/**
 * WordPress dependencies
 */
import { useSelect } from '@wordpress/data';
import { store as editPostStore, type EditPostStoreSelectors } from '@wordpress/edit-post';
import { useEffect } from '@wordpress/element';
import { applyFilters } from '@wordpress/hooks';

function isTextAreaElement( element: Element | null ): element is HTMLTextAreaElement {
	return element?.matches( 'textarea' ) ?? false;
}

export function ReadOnlyCodeEditor() {
	// Get the current editor mode (visual or text).
	// Visual mode is the default block editor mode.
	// Text mode is the code editor mode.
	const editorMode = useSelect< EditPostStoreSelectors, 'visual' | 'text' | undefined >( select => {
		const { getEditorMode } = select( editPostStore );
		return getEditorMode();
	} );

	// When in text mode, set the code editor (textarea) to read-only.
	useEffect( () => {
		if ( editorMode === 'text' ) {
			const editorPostTextEditorElement = document.querySelector( '.editor-post-text-editor' );

			if ( isTextAreaElement( editorPostTextEditorElement ) ) {
				// Add a filter here to customize this value, based on any external logic.
				const readOnly = applyFilters( 'vip_rtc_read_only_code_editor', true );

				// Ensure we have a boolean value only, defaulting to true for safety.
				editorPostTextEditorElement.readOnly = typeof readOnly === 'boolean' ? readOnly : true;
			}
		}
	}, [ editorMode ] );

	return null;
}
