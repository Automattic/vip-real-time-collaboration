import { BlockEditorStoreSelectors, store as blockEditorStore } from '@wordpress/block-editor';
import { useSelect } from '@wordpress/data';
import { WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';
import { useEffect } from '@wordpress/element';
import { type SyncProvider } from '@wordpress/sync';

import { useSortedAwarenessUsers } from './use-sorted-awareness-users';
import { UserState } from '@/store/awareness-store';

enum SelectionType {
	None,
	CursorOnly,
	SelectionInOneBlock,
	SelectionInMultipleBlocks,
}

type SelectionNone = {
	type: SelectionType.None;
};

type SelectionCursorOnly = {
	type: SelectionType.CursorOnly;
	blockId: string;
	cursorPosition: number;
};

type SelectionInOneBlock = {
	type: SelectionType.SelectionInOneBlock;
	blockId: string;
	cursorStartPosition: number;
	cursorEndPosition: number;
};

type SelectionInMultipleBlocks = {
	type: SelectionType.SelectionInMultipleBlocks;
	blockStartId: string;
	blockEndId: string;
	cursorStartPosition: number;
	cursorEndPosition: number;
};

export type SelectionState =
	| SelectionNone
	| SelectionCursorOnly
	| SelectionInOneBlock
	| SelectionInMultipleBlocks;

/**
 * Custom hook for rendering cursors for each user in the editor.
 * @param awareness - The awareness instance
 * @param overlay - The ref to the overlay element
 * @param isEnabled - Whether the rendering is enabled
 */
export function useRenderCursors(
	overlay: HTMLElement | null,
	editor: HTMLElement | null,
	awareness: SyncProvider[ 'awareness' ],
	isEnabled: boolean = true
) {
	const { selectionStart, selectionEnd } = useSelect<
		BlockEditorStoreSelectors,
		{ selectionStart: WPBlockSelection; selectionEnd: WPBlockSelection }
	>( select => {
		return {
			selectionStart: select( blockEditorStore ).getSelectionStart(),
			selectionEnd: select( blockEditorStore ).getSelectionEnd(),
		};
	} );

	// Update the local state field when our selected block changes.
	useEffect( () => {
		const selectionState = getSelectionState( selectionStart, selectionEnd );
		const localState = awareness.getLocalState();
		const userState = localState?.userState as UserState | undefined;

		if ( userState ) {
			awareness.setLocalStateField( 'userState', {
				...userState,
				editorState: {
					...userState.editorState,
					selection: selectionState,
				},
			} );
		}
	}, [ selectionStart, selectionEnd ] );

	// Draw the cursor for each user
	const userSelections = useSortedAwarenessUsers().map( user => {
		return {
			userName: user.name,
			selection: user.editorState.selection,
			color: user.color,
		};
	} );

	useEffect( () => {
		if ( ! overlay ) {
			return;
		}

		overlay.querySelectorAll( '.vip-rtc-selection' ).forEach( element => {
			element.remove();
		} );

		// userSelections.forEach( ( { userName, selection, color } ) => {
		// 	if ( selection?.type === SelectionType.CursorOnly ) {
		// 		const blockElement = editor.querySelector( `[data-block="${ blockId }"]` );
		// 		if ( ! blockElement ) {
		// 		}
		// 	}
		// } );
	}, [ userSelections ] );
}

const getSelectionState = (
	selectionStart: WPBlockSelection,
	selectionEnd: WPBlockSelection
): SelectionState => {
	if ( ! selectionStart ) {
		// Case 1: No selection
		return {
			type: SelectionType.None,
		};
	}

	const isSelectionInOneBlock = selectionStart.clientId === selectionEnd.clientId;
	const isCursorOnly = isSelectionInOneBlock && selectionStart.offset === selectionEnd.offset;

	if ( isCursorOnly ) {
		// Case 2: Cursor only, no text selected
		return {
			type: SelectionType.CursorOnly,
			blockId: selectionStart.clientId,
			cursorPosition: selectionStart.offset,
		};
	} else if ( isSelectionInOneBlock ) {
		// Case 3: Selection in a single block
		return {
			type: SelectionType.SelectionInOneBlock,
			blockId: selectionStart.clientId,
			cursorStartPosition: selectionStart.offset,
			cursorEndPosition: selectionEnd.offset,
		};
	}

	// Selection in multiple blocks
	return {
		type: SelectionType.SelectionInMultipleBlocks,
		blockStartId: selectionStart.clientId,
		blockEndId: selectionEnd.clientId,
		cursorStartPosition: selectionStart.offset,
		cursorEndPosition: selectionEnd.offset,
	};
};
