import '@wordpress/block-editor';

import type { WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';
import type { Slot, Fill } from '@wordpress/components';
import type { MutableRefObject } from 'react';
import React from 'react';

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
		insertBlock: (
			block: BlockInstance,
			index?: number,
			rootClientId?: string,
			updateSelection?: boolean,
			meta?: Record< string, any >
		) => Record< string, any >;
	}

	interface BlockCanvasCoverFillProps {
		children?:
			| React.ReactNode
			| ( ( props: { containerRef: MutableRefObject< HTMLElement | null > } ) => React.ReactNode );
	}

	const BlockCanvasCover: {
		Fill: React.FC< BlockCanvasCoverFillProps >;
		Slot: React.FC< {
			fillProps: { containerRef: MutableRefObject< HTMLElement | null > };
			children: ( fills: React.ReactNode[] ) => React.ReactNode;
		} >;
	};
}
