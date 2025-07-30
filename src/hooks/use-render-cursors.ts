import { BlockEditorStoreSelectors, store as blockEditorStore } from '@wordpress/block-editor';
import { debounce } from '@wordpress/compose';
import { useSelect } from '@wordpress/data';
import { WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';
import { useEffect, useMemo, useRef } from '@wordpress/element';
import { type SyncProvider } from '@wordpress/sync';

import { useSortedAwarenessUsers } from './use-sorted-awareness-users';
import { store as rtcSettingsStore, SettingsStoreSelectors } from '../store/settings-store';
import { throttleByAnimationFrame } from '../utilities/throttle';
import { UserState } from '@/store/awareness-store';

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
	blockEditorDocument: Document | null,
	awareness: SyncProvider[ 'awareness' ]
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

	const isEnabled = useSelect< SettingsStoreSelectors, boolean >( select => {
		return select( rtcSettingsStore ).isAwarenessOverlayEnabled();
	} );

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

	// Update the awareness state when user selection changes (with 20ms debounce)
	useEffect( () => {
		debouncedUpdateSelection( selectionStart, selectionEnd, awareness );
	}, [ selectionStart, selectionEnd, awareness, debouncedUpdateSelection ] );

	const sortedUsers = useSortedAwarenessUsers();

	// Use a ref to store the current render function to avoid stale closures
	const renderCursorsRef = useRef< () => void >();

	// Update render function and call it when user selection or mounted elements change
	useEffect( () => {
		renderCursorsRef.current = () => {
			if ( ! overlayRef.current || ! blockEditorDocument || ! isEnabled ) {
				return;
			}

			const userSelections = sortedUsers.map( user => {
				return {
					userName: user.name,
					selection: user.editorState.selection ?? { type: SelectionType.None },
					color: user.color,
				};
			} );

			drawUserSelections( overlayRef.current, blockEditorDocument, userSelections );
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

			// Create label
			const label = document.createElement( 'div' );
			label.className = 'vip-realtime-collaboration-user-cursor-label';
			label.textContent = userName;
			label.style.backgroundColor = color;
			cursor.appendChild( label );

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

	let node = treeWalker.nextNode();

	while ( node ) {
		if ( ! node.nodeValue?.length ) {
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
		return { node: lastTextNode, offset: lastTextNode.nodeValue.length };
	}

	return { node: blockElement, offset: 0 };
};
