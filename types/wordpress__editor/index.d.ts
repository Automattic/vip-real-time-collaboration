import '@wordpress/core-editor';

declare module '@wordpress/editor' {
	interface EditorStoreSelectors {
		getCurrentPostId(): number | null;
		getCurrentPostType(): string | null;
		getEditedPostContent(): string | null;
	}
}
