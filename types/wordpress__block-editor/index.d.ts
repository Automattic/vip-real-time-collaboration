import '@wordpress/block-editor';

import type { WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';

declare module '@wordpress/block-editor' {
	interface BlockEditorStoreSelectors {
		getSelectedBlockClientId: () => string | null;
		getSelectionStart: () => WPBlockSelection;
		getSelectionEnd: () => WPBlockSelection;
		isBlockValid: ( clientId: string ) => boolean;
		getBlock: ( clientId: string ) => BlockInstance;
		getBlockOrder: () => string[];
		getSelectedBlocksInitialCaretPosition: () => number | null;
	}

	interface BlockEditorStoreActions {
		selectBlock: ( clientId: string, initialPosition?: number ) => void;
		selectionChange: (
			clientId: string,
			attributeKey?: string,
			startOffset?: number,
			endOffset?: number
		) => void;
	}
}
