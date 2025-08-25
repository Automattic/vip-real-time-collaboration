import { useCopyToClipboard } from '@wordpress/compose';
import { useSelect } from '@wordpress/data';
import { type EditorStoreSelectors, store as editorStore } from '@wordpress/editor';

export function useCopyPostContentToClipboard( onSuccess: () => void = () => {} ) {
	const postContent = useSelect< EditorStoreSelectors, string | null >( select => {
		const { getEditedPostContent } = select( editorStore );
		return getEditedPostContent();
	} );

	return useCopyToClipboard( postContent ?? '', onSuccess );
}
