import {
	BlockEditorStoreActions,
	BlockEditorStoreSelectors,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { BlockInstance } from '@wordpress/blocks';
import { debounce } from '@wordpress/compose';
import { store as coreStore } from '@wordpress/core-data';
import { dispatch, useDispatch, useSelect } from '@wordpress/data';
import { WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';
import { useEffect, useMemo, useRef } from '@wordpress/element';

import { useCurrentEntity, type CurrentEntity } from './use-current-entity';
import { useSortedAwarenessUsers } from './use-sorted-awareness-users';
import { store as awarenessStore } from '../store/awareness-store';
import { store as rtcSettingsStore, SettingsStoreSelectors } from '../store/settings-store';
import { throttleByAnimationFrame } from '../utilities/throttle';

import type { MutableRefObject } from 'react';

/**
 * Todo: Maybe use integers for SelectionType values
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
 * @param overlayRef - The ref to the overlay element
 * @param blockEditorDocument - The block editor document
 * @param awareness - The awareness instance
 */
export function useRenderCursors(
	overlayRef: MutableRefObject< HTMLElement | null >,
	blockEditorDocument: Document | null
) {
	const { selectionChange } = useDispatch< BlockEditorStoreActions >( blockEditorStore );
	const { selectionStart, selectionEnd, isBlockValid, getBlock, initialCaretPosition } = useSelect<
		BlockEditorStoreSelectors,
		{
			selectionStart: WPBlockSelection;
			selectionEnd: WPBlockSelection;
			initialCaretPosition: number | null;
			isBlockValid: ( clientId: string ) => boolean;
			getBlock: ( clientId: string ) => BlockInstance;
		}
	>( select => {
		return {
			selectionStart: select( blockEditorStore ).getSelectionStart(),
			selectionEnd: select( blockEditorStore ).getSelectionEnd(),
			isBlockValid: select( blockEditorStore ).isBlockValid,
			getBlock: select( blockEditorStore ).getBlock,
			initialCaretPosition: select( blockEditorStore ).getSelectedBlocksInitialCaretPosition(),
		};
	} );

	const entity = useCurrentEntity();

	// Disabled - may cause lag issues.
	// // Workaround:
	// // When a user is in the editor and creates two new blocks in a row, and then uses <Backspace> to delete the
	// // second block, the selection is not updated.
	// // Intercept the `mergeBlocks` call and update the selection after WordPress has processed the merge.
	// useInterceptActionDispatch(
	// 	blockEditorStore,
	// 	'mergeBlocks',
	// 	( originalAction, args: unknown[] ) => {
	// 		originalAction( ...args );

	// 		// Trigger selection update after the merge
	// 		setTimeout( () => {
	// 			const clientIds = args as string[];
	// 			for ( const clientId of clientIds ) {
	// 				const block = getBlock( clientId );
	// 				if ( isBlockValid( clientId ) && isUnmodifiedDefaultBlock( block ) ) {
	// 					selectionChange( clientId );
	// 				}
	// 			}
	// 		}, 0 );
	// 	}
	// );

	const isEnabled = useSelect< SettingsStoreSelectors, boolean >( select => {
		return select( rtcSettingsStore ).isAwarenessCursorsEnabled();
	} );

	const debouncedUpdateSelection = useMemo(
		() => debounce( updateSelection as ( ...args: unknown[] ) => void, 20 ),
		[]
	);

	// Update the awareness state when user selection changes (with debounce)
	useEffect( () => {
		if ( entity ) {
			debouncedUpdateSelection( selectionStart, selectionEnd, initialCaretPosition, entity );
		}
	}, [ selectionStart, selectionEnd, debouncedUpdateSelection, initialCaretPosition, entity ] );

	const sortedUsers = useSortedAwarenessUsers();

	// Use a ref to store the current render function to avoid stale closures
	const renderCursorsRef = useRef< () => void >();

	// Draw user cursors in the overlay.
	useEffect( () => {
		renderCursorsRef.current = () => {
			if ( ! overlayRef.current || ! blockEditorDocument ) {
				return;
			}

			const userSelections = sortedUsers.map( user => {
				return {
					userName: user.name,
					selection: user.editorState.selection ?? { type: SelectionType.None },
					color: user.color,
				};
			} );

			drawUserSelections( overlayRef.current, blockEditorDocument, userSelections, isEnabled );
		};

		// Render cursors immediately when data changes
		renderCursorsRef.current();
	}, [ sortedUsers, overlayRef.current, blockEditorDocument, isEnabled ] );

	// Also re-render cursors on resize
	useEffect( () => {
		const handleResize = () => {
			if ( renderCursorsRef.current ) {
				renderCursorsRef.current();
			}
		};

		const throttledHandleResize = throttleByAnimationFrame( handleResize );

		window.addEventListener( 'resize', throttledHandleResize );
		return () => {
			window.removeEventListener( 'resize', throttledHandleResize );
		};
	}, [] );
}

/**
 * Updates the awareness state with the current user's selection.
 * Converts WordPress block editor selection to a SelectionState and broadcasts it to other users.
 *
 * @param start - The start position of the selection
 * @param end - The end position of the selection
 */
const updateSelection = async (
	selectionStart: WPBlockSelection,
	selectionEnd: WPBlockSelection,
	initialCaretPosition: number | null,
	entity: CurrentEntity
) => {
	const { editEntityRecord } = dispatch( coreStore );

	if ( selectionStart.clientId ) {
		// Send an entityRecord `selection` update if we have a selection.
		//
		// Normally WordPress updates the `selection` property of the post when changes are made to blocks.
		// In a multi-user setup, block changes can occur from other users. When an entity is updated from another
		// user's changes, useBlockSync() in Gutenberg will reset the user's selection to the last saved selection.
		//
		// Manually adding an edit for each movement ensures that other user's changes to the document will
		// not cause the local user's selection to reset to the last local change location.
		const edits = {
			selection: { selectionStart, selectionEnd, initialPosition: initialCaretPosition },
		};

		void editEntityRecord( entity.kind, entity.name, entity.recordId, edits, {
			undoIgnore: true,
		} );
	}

	const { setCurrentUserSelection } = dispatch( awarenessStore );
	const selection = getSelectionState( selectionStart, selectionEnd );
	void setCurrentUserSelection( selection );
};

/**
 * Converts WordPress block editor selection to a SelectionState.
 *
 * @param selectionStart - The start position of the selection
 * @param selectionEnd - The end position of the selection
 * @returns The SelectionState
 */
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

/**
 * Draws user selections on the overlay.
 *
 * @param overlay - The overlay element
 * @param editorDocument - The editor document
 * @param userSelections - The user selections
 */
const drawUserSelections = (
	overlay: HTMLElement,
	editorDocument: Document,
	userSelections: { userName: string; selection: SelectionState; color: string }[],
	isEnabled: boolean
) => {
	// Clear up previous state
	const userContainers = overlay.querySelectorAll( '.vip-real-time-collaboration-user' );
	userContainers.forEach( container => {
		container.remove();
	} );

	if ( ! isEnabled ) {
		return;
	}

	// Draw cursors
	userSelections.forEach( ( { userName, selection, color } ) => {
		let coords: { x: number; y: number; height: number } | null = null;

		if ( selection.type === SelectionType.None ) {
			// Do nothing
		} else if ( selection.type === SelectionType.Cursor ) {
			coords = getCursorPosition( selection, editorDocument, overlay );
		} else if ( selection.type === SelectionType.SelectionInOneBlock ) {
			// Until selection logic is implemented, render a selection as a cursor at the beginning of the selection.
			const selectionAsCursor: SelectionCursor = {
				type: SelectionType.Cursor,
				blockId: selection.blockId,
				cursorPosition: selection.cursorStartPosition,
			};

			coords = getCursorPosition( selectionAsCursor, editorDocument, overlay );
		} else if ( selection.type === SelectionType.SelectionInMultipleBlocks ) {
			// Until selection logic is implemented, render a selection as a cursor at the beginning of the selection.
			const selectionAsCursor: SelectionCursor = {
				type: SelectionType.Cursor,
				blockId: selection.blockStartId,
				cursorPosition: selection.cursorStartPosition,
			};

			coords = getCursorPosition( selectionAsCursor, editorDocument, overlay );
		}

		if ( coords ) {
			// Create parent container
			// Use `document` instead of `editorDocument` because the overlay is in the parent document.
			const userContainer = document.createElement( 'div' );
			userContainer.className = 'vip-real-time-collaboration-user';
			userContainer.style.left = `${ coords.x }px`;
			userContainer.style.top = `${ coords.y }px`;

			// Create cursor element
			const cursor = document.createElement( 'div' );
			cursor.className = 'vip-real-time-collaboration-user-cursor';
			cursor.style.backgroundColor = color;
			cursor.style.height = `${ coords.height }px`;

			// Create label
			const label = document.createElement( 'div' );
			label.className = 'vip-real-time-collaboration-user-label';
			label.textContent = userName;
			label.style.backgroundColor = color;

			// Append cursor and label to the container
			userContainer.appendChild( cursor );
			userContainer.appendChild( label );

			overlay.appendChild( userContainer );
		}
	} );
};

/**
 * Given a selection, returns the coordinates of the cursor in the block.
 *
 * @param selection - The selection
 * @param editorDocument - The editor document
 * @param overlay - The overlay element
 * @returns The position of the cursor
 */
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

/**
 * Given a block element and a character offset, returns the coordinates for drawing a visual cursor in the block.
 *
 * @param blockElement - The block element
 * @param charOffset - The character offset
 * @param editorDocument - The editor document
 * @param overlay - The overlay element
 * @returns The position of the cursor
 */
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

const MAX_NODE_OFFSET_COUNT = 1000;

/**
 * Given a block element and a character offset, returns an exact inner node and offset for use in a range.
 *
 * @param blockElement - The block element
 * @param offset - The character offset
 * @param editorDocument - The editor document
 * @returns The node and offset of the character at the offset
 */
const findInnerBlockOffset = (
	blockElement: HTMLElement,
	offset: number,
	editorDocument: Document
) => {
	const treeWalker = editorDocument.createTreeWalker(
		blockElement,
		NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT // eslint-disable-line no-bitwise
	);

	let currentOffset = 0;
	let lastTextNode: Node | null = null;

	let node: Node | null = null;
	let nodeCount = 1;

	while ( ( node = treeWalker.nextNode() ) ) {
		nodeCount++;

		if ( nodeCount > MAX_NODE_OFFSET_COUNT ) {
			// If we've walked too many nodes, return the last text node or the beginning of the block.
			if ( lastTextNode ) {
				return { node: lastTextNode, offset: 0 };
			}
			return { node: blockElement, offset: 0 };
		}

		const nodeLength = node.nodeValue?.length ?? 0;

		if ( node.nodeType === Node.ELEMENT_NODE ) {
			if ( node.nodeName === 'BR' ) {
				// Treat <br> as a single "\n" character.

				if ( currentOffset + 1 >= offset ) {
					// If the <br> occurs right on the target offset, return the next text node.
					const nodeAfterBr = treeWalker.nextNode();

					if ( nodeAfterBr?.nodeType === Node.TEXT_NODE ) {
						return { node: nodeAfterBr, offset: 0 };
					} else if ( lastTextNode ) {
						// If there's no text node after the <br>, return the end offset of the last text node.
						return { node: lastTextNode, offset: lastTextNode.nodeValue?.length ?? 0 };
					}
					// Just in case, if there's no last text node, return the beginning of the block.
					return { node: blockElement, offset: 0 };
				}

				// The <br> is before the target offset. Count it as a single character.
				currentOffset += 1;
				continue;
			} else {
				// Skip other element types.
				continue;
			}
		}

		if ( nodeLength === 0 ) {
			// Skip empty nodes.
			continue;
		}

		if ( currentOffset + nodeLength >= offset ) {
			// This node exceeds the target offset. Return the node and the position of the offset within it.
			return { node, offset: offset - currentOffset };
		}

		currentOffset += nodeLength;

		if ( node.nodeType === Node.TEXT_NODE ) {
			lastTextNode = node;
		}
	}

	if ( lastTextNode && lastTextNode.nodeValue?.length ) {
		// We didn't reach the target offset. Return the last text node's last character.
		return { node: lastTextNode, offset: lastTextNode.nodeValue.length };
	}

	// We didn't find any text nodes. Return the beginning of the block.
	return { node: blockElement, offset: 0 };
};
