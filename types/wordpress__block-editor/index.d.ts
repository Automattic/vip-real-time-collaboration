import '@wordpress/block-editor';

declare module '@wordpress/block-editor' {
	interface BlockEditorStoreSelectors extends StoreDescriptor< AnyConfig > {
		getSelectedBlockClientId: () => string | null;
	}
}
