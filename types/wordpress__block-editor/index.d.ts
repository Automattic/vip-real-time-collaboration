import '@wordpress/block-editor';

import type { WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';

declare module '@wordpress/block-editor' {
	interface BlockEditorStoreSelectors {
		getSelectedBlockClientId: () => string | null;
		getSelectionStart: () => WPBlockSelection;
	}
}
