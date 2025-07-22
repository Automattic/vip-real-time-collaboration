import { BlockEditorStoreSelectors, store as blockEditorStore } from '@wordpress/block-editor';
import { debounce } from '@wordpress/compose';
import { useSelect } from '@wordpress/data';
import { WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';
import { useEffect, useMemo } from '@wordpress/element';
import { type SyncProvider } from '@wordpress/sync';

import { useSortedAwarenessUsers } from './use-sorted-awareness-users';
import { UserState } from '@/store/awareness-store';

/**
 * Todo: Maybe change SelectionType values back to integers
 */
export enum SelectionType {
	None = 'none',
	Cursor = 'cursor',
	SelectionInOneBlock = 'selection-in-1-block',
	SelectionInMultipleBlocks = 'selection-in-multiple-blocks',
}

type SelectionNone = {
	type: SelectionType.None;
};

type SelectionCursor = {
	type: SelectionType.Cursor;
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
	| SelectionCursor
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

	// Create a debounced function that updates the awareness state
	const debouncedUpdateSelection = useMemo(
		() =>
			debounce( ( ...args: unknown[] ) => {
				const [ start, end, awarenessInstance ] = args as [
					WPBlockSelection,
					WPBlockSelection,
					SyncProvider[ 'awareness' ]
				];

				const selectionState = getSelectionState( start, end );
				const localState = awarenessInstance.getLocalState();
				const userState = localState?.userState as UserState | undefined;

				if ( userState ) {
					awarenessInstance.setLocalStateField( 'userState', {
						...userState,
						editorState: {
							...userState.editorState,
							selection: selectionState,
						},
					} );
				}
			}, 20 ),
		[]
	);

	// Update the local state field when our selected block changes (debounced)
	useEffect( () => {
		debouncedUpdateSelection( selectionStart, selectionEnd, awareness );
	}, [ selectionStart, selectionEnd, awareness, debouncedUpdateSelection ] );

	const sortedUsers = useSortedAwarenessUsers();

	useEffect( () => {
		if ( ! overlay || ! editor || ! isEnabled ) {
			return;
		}

		const userSelections = sortedUsers.map( user => {
			return {
				userName: user.name,
				selection: user.editorState.selection ?? { type: SelectionType.None },
				color: user.color,
			};
		} );

		renderCursors( overlay, editor, userSelections );
	}, [ sortedUsers, overlay, editor, isEnabled ] );
}

const getSelectionState = (
	selectionStart: WPBlockSelection,
	selectionEnd: WPBlockSelection
): SelectionState => {
	const isSelectionEmpty = Object.keys( selectionStart ).length === 0;
	if ( isSelectionEmpty ) {
		// Case 1: No selection
		return {
			type: SelectionType.None,
		};
	}

	// When the page initially loads, selectionStart can contain an empty object `{}`.
	const isSelectionInOneBlock = selectionStart.clientId === selectionEnd.clientId;
	const isCursorOnly = isSelectionInOneBlock && selectionStart.offset === selectionEnd.offset;

	if ( isCursorOnly ) {
		// Case 2: Cursor only, no text selected
		return {
			type: SelectionType.Cursor,
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

const renderCursors = (
	overlay: HTMLElement,
	editor: HTMLElement,
	userSelections: { userName: string; selection: SelectionState; color: string }[]
) => {
	console.log( '--- renderCursors():' );

	userSelections.forEach( ( { userName, selection, color } ) => {
		console.log( 'Draw user selection:', { userName, selection, color } );
	} );
};
