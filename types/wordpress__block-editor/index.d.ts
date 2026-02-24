import '@wordpress/block-editor';

declare module '@wordpress/block-editor' {
	interface BlockEditorStoreSelectors {
		getSelectedBlockClientId: () => string | null;
		getBlock: ( clientId: string ) => BlockInstance;
	}

	interface BlockEditorStoreActions {
		selectBlock: ( clientId: string, initialPosition?: number ) => void;
		insertBlock: (
			block: BlockInstance,
			index?: number,
			rootClientId?: string,
			updateSelection?: boolean,
			meta?: Record< string, any >
		) => Record< string, any >;
	}
}
