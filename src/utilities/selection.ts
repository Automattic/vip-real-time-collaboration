import { store as coreStore } from '@wordpress/core-data';
import { dispatch, select } from '@wordpress/data';
import { store as editorStore } from '@wordpress/editor';
import { type WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';
import * as Y from 'yjs';

// Convenience types to manage block values with a clientId, attributes, and innerBlocks.
type BlockClientId = string;
type BlockInnerBlocks = Y.Array< SelectableBlock >;
type BlockAttributes = Y.Map< Y.Text >;
export type SelectableBlock = Y.Map< BlockClientId | BlockAttributes | BlockInnerBlocks >;

export enum SelectionType {
	None = 'none',
	Cursor = 'cursor',
	SelectionInOneBlock = 'selection-in-one-block',
	SelectionInMultipleBlocks = 'selection-in-multiple-blocks',
	WholeBlock = 'whole-block',
}

export type SelectionNone = {
	// The user has not made a selection.
	type: SelectionType.None;
};

export type SelectionCursor = {
	// The user has a cursor position in a block with no text highlighted.
	type: SelectionType.Cursor;
	blockId: string;
	cursorPosition: Y.RelativePosition;
};

export type SelectionInOneBlock = {
	// The user has highlighted text in a single block.
	type: SelectionType.SelectionInOneBlock;
	blockId: string;
	cursorStartPosition: Y.RelativePosition;
	cursorEndPosition: Y.RelativePosition;
};

export type SelectionInMultipleBlocks = {
	// The user has highlighted text over multiple blocks.
	type: SelectionType.SelectionInMultipleBlocks;
	blockStartId: string;
	blockEndId: string;
	cursorStartPosition: Y.RelativePosition;
	cursorEndPosition: Y.RelativePosition;
};

export type SelectionWholeBlock = {
	// The user has a non-text block selected, like an image block.
	type: SelectionType.WholeBlock;
	blockId: string;
};

export type SelectionState =
	| SelectionNone
	| SelectionCursor
	| SelectionInOneBlock
	| SelectionInMultipleBlocks
	| SelectionWholeBlock;

export function areSelectionsEqual(
	selection1: SelectionState,
	selection2: SelectionState
): boolean {
	if ( selection1.type !== selection2.type ) {
		return false;
	}

	switch ( selection1.type ) {
		case SelectionType.None:
			return true;

		case SelectionType.Cursor:
			return (
				selection1.blockId === ( selection2 as SelectionCursor ).blockId &&
				selection1.cursorPosition === ( selection2 as SelectionCursor ).cursorPosition
			);

		case SelectionType.SelectionInOneBlock:
			return (
				selection1.blockId === ( selection2 as SelectionInOneBlock ).blockId &&
				selection1.cursorStartPosition ===
					( selection2 as SelectionInOneBlock ).cursorStartPosition &&
				selection1.cursorEndPosition === ( selection2 as SelectionInOneBlock ).cursorEndPosition
			);

		case SelectionType.SelectionInMultipleBlocks:
			return (
				selection1.blockStartId === ( selection2 as SelectionInMultipleBlocks ).blockStartId &&
				selection1.blockEndId === ( selection2 as SelectionInMultipleBlocks ).blockEndId &&
				selection1.cursorStartPosition ===
					( selection2 as SelectionInMultipleBlocks ).cursorStartPosition &&
				selection1.cursorEndPosition ===
					( selection2 as SelectionInMultipleBlocks ).cursorEndPosition
			);

		case SelectionType.WholeBlock:
			return selection1.blockId === ( selection2 as SelectionWholeBlock ).blockId;

		default:
			return false;
	}
}

/**
 * Converts WordPress block editor selection to a SelectionState.
 *
 * @param selectionStart - The start position of the selection
 * @param selectionEnd - The end position of the selection
 * @returns The SelectionState
 */
export function getSelectionState(
	selectionStart: WPBlockSelection,
	selectionEnd: WPBlockSelection,
	yBlocks: Y.Array< SelectableBlock >
): SelectionState {
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
	const isSelectionAWholeBlock =
		isSelectionInOneBlock &&
		selectionStart.offset === undefined &&
		selectionEnd.offset === undefined;

	if ( isSelectionAWholeBlock ) {
		// Case 2: A whole block is selected.
		return {
			type: SelectionType.WholeBlock,
			blockId: selectionStart.clientId,
		};
	} else if ( isCursorOnly ) {
		// Case 3: Cursor only, no text selected
		return {
			type: SelectionType.Cursor,
			blockId: selectionStart.clientId,
			cursorPosition: getRelativeCursorPosition( selectionStart, yBlocks ),
		};
	} else if ( isSelectionInOneBlock ) {
		// Case 4: Selection in a single block
		return {
			type: SelectionType.SelectionInOneBlock,
			blockId: selectionStart.clientId,
			cursorStartPosition: getRelativeCursorPosition( selectionStart, yBlocks ),
			cursorEndPosition: getRelativeCursorPosition( selectionEnd, yBlocks ),
		};
	}

	// Caes 5: Selection in multiple blocks
	return {
		type: SelectionType.SelectionInMultipleBlocks,
		blockStartId: selectionStart.clientId,
		blockEndId: selectionEnd.clientId,
		cursorStartPosition: getRelativeCursorPosition( selectionStart, yBlocks ),
		cursorEndPosition: getRelativeCursorPosition( selectionEnd, yBlocks ),
	};
}

/**
 * Update the entity record with the current user's selection.
 *
 * @param start - The start position of the selection
 * @param end - The end position of the selection
 */
export async function updateSelectionInEntityRecord(
	selectionStart: WPBlockSelection,
	selectionEnd: WPBlockSelection,
	initialPosition: number | null
): Promise< void > {
	const { editEntityRecord } = dispatch( coreStore );
	const { getCurrentPostId, getCurrentPostType } = select( editorStore );

	const postId = getCurrentPostId();
	const postType = getCurrentPostType();

	if ( ! postId || ! postType || ! selectionStart.clientId ) {
		return;
	}

	// Send an entityRecord `selection` update if we have a selection.
	//
	// Normally WordPress updates the `selection` property of the post when changes are made to blocks.
	// In a multi-user setup, block changes can occur from other users. When an entity is updated from another
	// user's changes, useBlockSync() in Gutenberg will reset the user's selection to the last saved selection.
	//
	// Manually adding an edit for each movement ensures that other user's changes to the document will
	// not cause the local user's selection to reset to the last local change location.
	const edits = {
		selection: { selectionStart, selectionEnd, initialPosition },
	};

	await editEntityRecord( 'postType', postType, postId, edits, {
		undoIgnore: true,
	} );
}

export function getRelativeCursorPosition(
	selection: WPBlockSelection,
	blocks: Y.Array< SelectableBlock >
): Y.RelativePosition {
	const block = findBlockByClientId( selection.clientId, blocks );
	const attributes = block.get( 'attributes' ) as Y.Map< Y.Text >;
	const currentYText = attributes.get( selection.attributeKey ) as Y.Text;

	const relativePosition = Y.createRelativePositionFromTypeIndex( currentYText, selection.offset );
	console.log( 'Created relative position:', {
		relativePositionJson: JSON.stringify( relativePosition ),
	} );
	return relativePosition;
}

function findBlockByClientId(
	blockId: string,
	blocks: Y.Array< SelectableBlock >
): SelectableBlock {
	for ( const block of blocks ) {
		if ( block.get( 'clientId' ) === blockId ) {
			return block;
		}

		const innerBlocks = block.get( 'innerBlocks' ) as BlockInnerBlocks;

		if ( innerBlocks.length > 0 ) {
			const innerBlock = findBlockByClientId(
				blockId,
				block.get( 'innerBlocks' ) as Y.Array< SelectableBlock >
			);

			if ( innerBlock ) {
				return innerBlock;
			}
		}
	}

	throw new Error( `Unable to find block with findBlockByClientId() for clientId: ${ blockId }` );
}
