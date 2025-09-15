import { useSelect } from '@wordpress/data';
import { useEffect, useRef } from '@wordpress/element';

import { useSortedAwarenessUsers } from '@/hooks/use-sorted-awareness-users';
import { store as rtcSettingsStore, SettingsStoreSelectors } from '@/store/settings-store';
import { Logger } from '@/utilities/logger';
import { type SelectionCursor, type SelectionState, SelectionType } from '@/utilities/selection';
import { throttleByAnimationFrame } from '@/utilities/throttle';

import type { MutableRefObject } from 'react';

enum DrawType {
	None,
	OtherUsers,
	All,
}

const logger = new Logger( 'use-render-cursors' );

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
	const drawType = useSelect< SettingsStoreSelectors, DrawType >( select => {
		const { isAwarenessCursorsEnabled, isSelfAwarenessEnabled } = select( rtcSettingsStore );
		if ( isAwarenessCursorsEnabled() ) {
			if ( isSelfAwarenessEnabled() ) {
				return DrawType.All;
			}

			return DrawType.OtherUsers;
		}

		return DrawType.None;
	} );

	const sortedUsers = useSortedAwarenessUsers();

	// Use a ref to store the current render function to avoid stale closures
	const renderCursorsRef = useRef< () => void >();

	// Draw user cursors in the overlay.
	useEffect( () => {
		renderCursorsRef.current = () => {
			const userSelections = sortedUsers.map( user => ( {
				userName: user.name,
				// Replace local user's selection with the current selection from the editor state.
				selection: user.editorState.selection ?? { type: SelectionType.None },
				color: user.color,
				isMe: user.isMe,
			} ) );

			drawUserSelections( overlayRef.current, blockEditorDocument, userSelections, drawType );
		};

		// Render cursors immediately when data changes
		renderCursorsRef.current();
	}, [ drawType, sortedUsers, overlayRef.current, blockEditorDocument ] );

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

	// Listen for layout changes from ResizeObserver
	useEffect( () => {
		const overlay = overlayRef.current;
		if ( ! overlay ) {
			return;
		}

		const handleRedrawCursors = () => {
			// ResizeObserver detected a layout change - redraw cursors
			if ( renderCursorsRef.current ) {
				renderCursorsRef.current();
			}
		};

		overlay.addEventListener( 'redrawCursors', handleRedrawCursors );
		return () => overlay.removeEventListener( 'redrawCursors', handleRedrawCursors );
	}, [ overlayRef.current ] );
}

/**
 * Draws user selections on the overlay.
 *
 * @param overlay - The overlay element
 * @param editorDocument - The editor document
 * @param userSelections - The user selections
 */
const drawUserSelections = (
	overlay: HTMLElement | null,
	editorDocument: Document | null,
	userSelections: { userName: string; selection: SelectionState; color: string; isMe: boolean }[],
	drawType: DrawType
) => {
	if ( ! overlay || ! editorDocument ) {
		return;
	}

	// Clear up previous state
	const userContainers = overlay.querySelectorAll( '.vip-real-time-collaboration-user' );
	userContainers.forEach( container => {
		container.remove();
	} );

	if ( drawType === DrawType.None ) {
		return;
	}

	// Draw cursors
	userSelections.forEach( ( { userName, selection, color, isMe } ) => {
		if ( isMe && drawType === DrawType.OtherUsers ) {
			// Skip drawing the local user's cursor.
			return;
		}

		let coords: { x: number; y: number; height: number } | null = null;

		if ( selection.type === SelectionType.None ) {
			// Nothing selected.
		} else if ( selection.type === SelectionType.WholeBlock ) {
			// Don't try to draw a cursor for a whole block selection.
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
		logger.error( 'Failed to create a range for cursor:', { error, node, offset } );
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
