/**
 * WordPress dependencies
 */
import { useEffect } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { store as editPostStore, type EditPostStoreSelectors } from '@wordpress/edit-post';

// If you can add a component to the editor
export function ReadOnlyCodeEditor() {
	const editorMode = useSelect< EditPostStoreSelectors, 'visual' | 'text' | undefined >( select => {
		const { getEditorMode } = select( editPostStore );
		return getEditorMode();
	} );

	useEffect( () => {
		if ( editorMode === 'text' ) {
			const textarea = document.querySelector< HTMLTextAreaElement >( '.editor-post-text-editor' );
			if ( textarea ) {
				textarea.readOnly = true;
			}
		}
	}, [ editorMode ] );

	return null;
}
