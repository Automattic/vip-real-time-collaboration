import { useSelect } from '@wordpress/data';
import { type EditorStoreSelectors, store as editorStore } from '@wordpress/editor';

export interface CurrentEntity {
	kind: string;
	name: string;
	recordId: number;
}

export function useCurrentEntity(): CurrentEntity | null {
	const entityKind = 'postType';
	const { postId, postType } = useSelect<
		EditorStoreSelectors,
		{ postId: number | null; postType: string | null }
	>( select => {
		const { getCurrentPostId, getCurrentPostType } = select( editorStore );

		return {
			postId: getCurrentPostId(),
			postType: getCurrentPostType(),
		};
	} );

	if ( postId && postType ) {
		return {
			kind: entityKind,
			name: postType,
			recordId: postId,
		};
	}

	return null;
}
