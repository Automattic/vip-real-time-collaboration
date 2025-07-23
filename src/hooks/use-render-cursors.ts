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
	blockEditorDocument: Document | null,
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
		if ( ! overlay || ! blockEditorDocument || ! isEnabled ) {
			return;
		}

		const userSelections = sortedUsers.map( user => {
			return {
				userName: user.name,
				selection: user.editorState.selection ?? { type: SelectionType.None },
				color: user.color,
			};
		} );

		drawUserSelections( overlay, blockEditorDocument, userSelections );
	}, [ sortedUsers, overlay, blockEditorDocument, isEnabled ] );
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

const drawUserSelections = (
	overlay: HTMLElement,
	editorDocument: Document,
	userSelections: { userName: string; selection: SelectionState; color: string }[]
) => {
	// Clear up previous state
	const userCursors = overlay.querySelectorAll( '.vip-realtime-collaboration-user-cursor' );
	userCursors.forEach( cursor => {
		cursor.remove();
	} );

	// Draw cursors
	userSelections.forEach( ( { userName, selection, color } ) => {
		console.log( 'Draw user selection:', selection, { userName, color } );

		if ( selection.type === SelectionType.None ) {
			// Do nothing
		} else if ( selection.type === SelectionType.Cursor ) {
			const coords = getCursorPosition( selection, editorDocument, overlay );
			if ( ! coords ) {
				return;
			}

			// Create cursor element
			// Use `document` instead of `editorDocument` because the overlay is in the parent document.
			const cursor = document.createElement( 'div' );
			cursor.className = 'vip-realtime-collaboration-user-cursor';
			cursor.style.left = `${ coords.x }px`;
			cursor.style.top = `${ coords.y }px`;
			cursor.style.backgroundColor = color;
			cursor.style.height = `${ coords.height }px`;

			// // Create label
			// const label = this.document.createElement( 'div' );
			// label.className = 'cursor-label';
			// label.textContent = `User ${ userId }`; // In a real app, you'd fetch the user's name
			// label.style.backgroundColor = color;
			// cursor.appendChild( label );

			overlay.appendChild( cursor );
		}
	} );
};

const getCursorPosition = (
	selection: SelectionCursor,
	editorDocument: Document,
	overlay: HTMLElement
) => {
	const blockElement = editorDocument.querySelector(
		`[data-block="${ selection.blockId }"]`
	) as HTMLElement;

	if ( ! blockElement ) {
		return null;
	}

	const coords = getOffsetPositionInBlock(
		blockElement,
		selection.cursorPosition,
		editorDocument,
		overlay
	);

	return coords ?? null;
};

const getOffsetPositionInBlock = (
	blockElement: HTMLElement,
	charOffset: number,
	editorDocument: Document,
	overlay: HTMLElement
) => {
	const { node, offset } = findInnerBlockOffset( blockElement, charOffset, editorDocument );

	const cursorRange = editorDocument.createRange();

	try {
		cursorRange.setStart( node, offset );
	} catch ( error ) {
		console.error( 'Failed to create a range for cursor:', { error, node, offset } );
		return null;
	}

	// Ensure the range only represents single point in the DOM.
	cursorRange.collapse( true );

	const cursorRect = cursorRange.getBoundingClientRect();
	const overlayRect = overlay.getBoundingClientRect();
	const blockRect = blockElement.getBoundingClientRect();

	let cursorX = 0;
	let cursorY = 0;

	if (
		cursorRect.x === 0 &&
		cursorRect.y === 0 &&
		cursorRect.width === 0 &&
		cursorRect.height === 0
	) {
		// This can happen for empty blocks.
		cursorX = blockRect.left - overlayRect.left;
		cursorY = blockRect.top - overlayRect.top;
	} else {
		cursorX = cursorRect.left - overlayRect.left;
		cursorY = cursorRect.top - overlayRect.top;
	}

	let cursorHeight = cursorRect.height;
	if ( cursorHeight === 0 ) {
		cursorHeight =
			parseInt( window.getComputedStyle( blockElement ).lineHeight, 10 ) || blockRect.height;
	}

	return {
		x: cursorX,
		y: cursorY,
		height: cursorHeight,
	};
};

const findInnerBlockOffset = (
	blockElement: HTMLElement,
	offset: number,
	editorDocument: Document
) => {
	const treeWalker = editorDocument.createTreeWalker( blockElement, NodeFilter.SHOW_TEXT );
	let currentOffset = 0;
	let lastTextNode = null;

	console.log( 'Walker starting with:', { blockElement } );
	let node = treeWalker.nextNode();

	while ( node ) {
		console.log( 'Walker processing node:', node );

		if ( ! node.nodeValue?.length ) {
			console.log( 'Walker skipping node:', node );
			continue;
		}

		const nodeLength = node.nodeValue.length;

		if ( currentOffset + nodeLength >= offset ) {
			return { node, offset: offset - currentOffset };
		}

		currentOffset += nodeLength;
		lastTextNode = node;

		node = treeWalker.nextNode();
	}

	if ( lastTextNode && lastTextNode.nodeValue?.length ) {
		console.log( 'Walker returning last text node:', lastTextNode );
		return { node: lastTextNode, offset: lastTextNode.nodeValue.length };
	}

	console.log( 'Not sure where the cursor is, returning offset 0 on the block' );
	return { node: blockElement, offset: 0 };
};
