/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion */
import { __dangerousOptInToUnstableAPIsOnlyForCoreModules } from '@wordpress/private-apis';
import { privateApis as syncPrivateApis, type Y as _Y } from '@wordpress/sync';
import assert from 'node:assert';
import { before, describe, it, mock } from 'node:test';

import type {
	SelectionType,
	SelectionState,
	SelectionNone,
	SelectionCursor,
	SelectionInOneBlock,
	SelectionInMultipleBlocks,
	SelectionWholeBlock,
	CursorPosition,
} from './selection';

const { unlock } = __dangerousOptInToUnstableAPIsOnlyForCoreModules(
	'I acknowledge private features are not for use in themes or plugins and doing so will break in the next version of WordPress.',
	'@wordpress/sync'
);

const { Y } = unlock( syncPrivateApis ) as { Y: typeof _Y };

describe( 'areSelectionsEqual', () => {
	let areSelectionsEqual: typeof import('./selection').areSelectionsEqual;
	let SelectionType: typeof import('./selection').SelectionType;

	before( async () => {
		// These modules access browser globals in their top-level scope which makes
		// it impossible to import the `./selection` module in this file's top-level
		// scope. Therefore, we must mock them and then dynamically import the module
		// under test.
		mock.module( '@wordpress/core-data' );
		mock.module( '@wordpress/editor' );

		// @ts-expect-error: TS2702 Dynamic import -- used to navigate import issues mentioned above.
		const selectionModule = await import( './selection' );
		areSelectionsEqual = selectionModule.areSelectionsEqual;
		SelectionType = selectionModule.SelectionType;
	} );
	describe( 'different selection types', () => {
		it( 'returns false when comparing different selection types', () => {
			const selection1: SelectionNone = { type: SelectionType.None };
			const selection2: SelectionCursor = {
				type: SelectionType.Cursor,
				blockId: 'block-1',
				cursorPosition: createCursorPosition( 'test', 0 ),
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );
	} );

	describe( 'SelectionType.None', () => {
		it( 'returns true when both selections are None', () => {
			const selection1: SelectionNone = { type: SelectionType.None };
			const selection2: SelectionNone = { type: SelectionType.None };

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), true );
		} );
	} );

	describe( 'SelectionType.Cursor', () => {
		it( 'returns true when cursor selections are identical', () => {
			const cursorPosition = createCursorPosition( 'test text', 5 );
			const selection1: SelectionCursor = {
				type: SelectionType.Cursor,
				blockId: 'block-1',
				cursorPosition,
			};
			const selection2: SelectionCursor = {
				type: SelectionType.Cursor,
				blockId: 'block-1',
				cursorPosition,
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), true );
		} );

		it( 'returns false when blockId differs', () => {
			const cursorPosition = createCursorPosition( 'test text', 5 );
			const selection1: SelectionCursor = {
				type: SelectionType.Cursor,
				blockId: 'block-1',
				cursorPosition,
			};
			const selection2: SelectionCursor = {
				type: SelectionType.Cursor,
				blockId: 'block-2',
				cursorPosition,
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );

		it( 'returns false when relative position differs', () => {
			const selection1: SelectionCursor = {
				type: SelectionType.Cursor,
				blockId: 'block-1',
				cursorPosition: createCursorPosition( 'test text', 5 ),
			};
			const selection2: SelectionCursor = {
				type: SelectionType.Cursor,
				blockId: 'block-1',
				cursorPosition: createCursorPosition( 'test text', 3 ),
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );

		it( 'returns false when absolute offset differs', () => {
			const yText = createYText( 'test text' );
			const relativePosition = Y.createRelativePositionFromTypeIndex( yText, 5 );

			const selection1: SelectionCursor = {
				type: SelectionType.Cursor,
				blockId: 'block-1',
				cursorPosition: {
					relativePosition,
					absoluteOffset: 5,
				},
			};
			const selection2: SelectionCursor = {
				type: SelectionType.Cursor,
				blockId: 'block-1',
				cursorPosition: {
					relativePosition,
					absoluteOffset: 6,
				},
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );
	} );

	describe( 'SelectionType.SelectionInOneBlock', () => {
		it( 'returns true when selections in one block are identical', () => {
			const cursorStartPosition = createCursorPosition( 'test text', 0 );
			const cursorEndPosition = createCursorPosition( 'test text', 4 );
			const selection1: SelectionInOneBlock = {
				type: SelectionType.SelectionInOneBlock,
				blockId: 'block-1',
				cursorStartPosition,
				cursorEndPosition,
			};
			const selection2: SelectionInOneBlock = {
				type: SelectionType.SelectionInOneBlock,
				blockId: 'block-1',
				cursorStartPosition,
				cursorEndPosition,
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), true );
		} );

		it( 'returns false when blockId differs', () => {
			const cursorStartPosition = createCursorPosition( 'test text', 0 );
			const cursorEndPosition = createCursorPosition( 'test text', 4 );
			const selection1: SelectionInOneBlock = {
				type: SelectionType.SelectionInOneBlock,
				blockId: 'block-1',
				cursorStartPosition,
				cursorEndPosition,
			};
			const selection2: SelectionInOneBlock = {
				type: SelectionType.SelectionInOneBlock,
				blockId: 'block-2',
				cursorStartPosition,
				cursorEndPosition,
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );

		it( 'returns false when start position differs', () => {
			const selection1: SelectionInOneBlock = {
				type: SelectionType.SelectionInOneBlock,
				blockId: 'block-1',
				cursorStartPosition: createCursorPosition( 'test text', 0 ),
				cursorEndPosition: createCursorPosition( 'test text', 4 ),
			};
			const selection2: SelectionInOneBlock = {
				type: SelectionType.SelectionInOneBlock,
				blockId: 'block-1',
				cursorStartPosition: createCursorPosition( 'test text', 1 ),
				cursorEndPosition: createCursorPosition( 'test text', 4 ),
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );

		it( 'returns false when end position differs', () => {
			const selection1: SelectionInOneBlock = {
				type: SelectionType.SelectionInOneBlock,
				blockId: 'block-1',
				cursorStartPosition: createCursorPosition( 'test text', 0 ),
				cursorEndPosition: createCursorPosition( 'test text', 4 ),
			};
			const selection2: SelectionInOneBlock = {
				type: SelectionType.SelectionInOneBlock,
				blockId: 'block-1',
				cursorStartPosition: createCursorPosition( 'test text', 0 ),
				cursorEndPosition: createCursorPosition( 'test text', 5 ),
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );

		it( 'returns false when absolute offset differs in start position', () => {
			const yText = createYText( 'test text' );
			const relativePosition = Y.createRelativePositionFromTypeIndex( yText, 0 );
			const cursorEndPosition = createCursorPosition( 'test text', 4 );

			const selection1: SelectionInOneBlock = {
				type: SelectionType.SelectionInOneBlock,
				blockId: 'block-1',
				cursorStartPosition: {
					relativePosition,
					absoluteOffset: 0,
				},
				cursorEndPosition,
			};
			const selection2: SelectionInOneBlock = {
				type: SelectionType.SelectionInOneBlock,
				blockId: 'block-1',
				cursorStartPosition: {
					relativePosition,
					absoluteOffset: 1,
				},
				cursorEndPosition,
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );
	} );

	describe( 'SelectionType.SelectionInMultipleBlocks', () => {
		it( 'returns true when selections in multiple blocks are identical', () => {
			const cursorStartPosition = createCursorPosition( 'first block', 5 );
			const cursorEndPosition = createCursorPosition( 'second block', 3 );
			const selection1: SelectionInMultipleBlocks = {
				type: SelectionType.SelectionInMultipleBlocks,
				blockStartId: 'block-1',
				blockEndId: 'block-2',
				cursorStartPosition,
				cursorEndPosition,
			};
			const selection2: SelectionInMultipleBlocks = {
				type: SelectionType.SelectionInMultipleBlocks,
				blockStartId: 'block-1',
				blockEndId: 'block-2',
				cursorStartPosition,
				cursorEndPosition,
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), true );
		} );

		it( 'returns false when blockStartId differs', () => {
			const cursorStartPosition = createCursorPosition( 'first block', 5 );
			const cursorEndPosition = createCursorPosition( 'second block', 3 );
			const selection1: SelectionInMultipleBlocks = {
				type: SelectionType.SelectionInMultipleBlocks,
				blockStartId: 'block-1',
				blockEndId: 'block-2',
				cursorStartPosition,
				cursorEndPosition,
			};
			const selection2: SelectionInMultipleBlocks = {
				type: SelectionType.SelectionInMultipleBlocks,
				blockStartId: 'block-0',
				blockEndId: 'block-2',
				cursorStartPosition,
				cursorEndPosition,
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );

		it( 'returns false when blockEndId differs', () => {
			const cursorStartPosition = createCursorPosition( 'first block', 5 );
			const cursorEndPosition = createCursorPosition( 'second block', 3 );
			const selection1: SelectionInMultipleBlocks = {
				type: SelectionType.SelectionInMultipleBlocks,
				blockStartId: 'block-1',
				blockEndId: 'block-2',
				cursorStartPosition,
				cursorEndPosition,
			};
			const selection2: SelectionInMultipleBlocks = {
				type: SelectionType.SelectionInMultipleBlocks,
				blockStartId: 'block-1',
				blockEndId: 'block-3',
				cursorStartPosition,
				cursorEndPosition,
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );

		it( 'returns false when start cursor position differs', () => {
			const selection1: SelectionInMultipleBlocks = {
				type: SelectionType.SelectionInMultipleBlocks,
				blockStartId: 'block-1',
				blockEndId: 'block-2',
				cursorStartPosition: createCursorPosition( 'first block', 5 ),
				cursorEndPosition: createCursorPosition( 'second block', 3 ),
			};
			const selection2: SelectionInMultipleBlocks = {
				type: SelectionType.SelectionInMultipleBlocks,
				blockStartId: 'block-1',
				blockEndId: 'block-2',
				cursorStartPosition: createCursorPosition( 'first block', 6 ),
				cursorEndPosition: createCursorPosition( 'second block', 3 ),
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );

		it( 'returns false when end cursor position differs', () => {
			const selection1: SelectionInMultipleBlocks = {
				type: SelectionType.SelectionInMultipleBlocks,
				blockStartId: 'block-1',
				blockEndId: 'block-2',
				cursorStartPosition: createCursorPosition( 'first block', 5 ),
				cursorEndPosition: createCursorPosition( 'second block', 3 ),
			};
			const selection2: SelectionInMultipleBlocks = {
				type: SelectionType.SelectionInMultipleBlocks,
				blockStartId: 'block-1',
				blockEndId: 'block-2',
				cursorStartPosition: createCursorPosition( 'first block', 5 ),
				cursorEndPosition: createCursorPosition( 'second block', 4 ),
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );
	} );

	describe( 'SelectionType.WholeBlock', () => {
		it( 'returns true when whole block selections are identical', () => {
			const selection1: SelectionWholeBlock = {
				type: SelectionType.WholeBlock,
				blockId: 'block-1',
			};
			const selection2: SelectionWholeBlock = {
				type: SelectionType.WholeBlock,
				blockId: 'block-1',
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), true );
		} );

		it( 'returns false when blockId differs', () => {
			const selection1: SelectionWholeBlock = {
				type: SelectionType.WholeBlock,
				blockId: 'block-1',
			};
			const selection2: SelectionWholeBlock = {
				type: SelectionType.WholeBlock,
				blockId: 'block-2',
			};

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );
	} );

	describe( 'unknown selection type', () => {
		it( 'returns false for unknown selection type', () => {
			const selection1: SelectionState = {
				type: 'unknown-type' as SelectionType,
			} as SelectionState;
			const selection2: SelectionNone = { type: SelectionType.None };

			assert.strictEqual( areSelectionsEqual( selection1, selection2 ), false );
		} );
	} );
} );

// Helper to create Y.Text and relative position
function createCursorPosition( text: string, offset: number ): CursorPosition {
	const yText = createYText( text );
	const relativePosition = Y.createRelativePositionFromTypeIndex( yText, offset );

	return {
		relativePosition,
		absoluteOffset: offset,
	};
}

const yDoc = new Y.Doc();
const yMap = yDoc.getMap( 'test-map' );

function createYText( yTextValue: string, yTextKey: string = 'test-text' ): _Y.Text {
	const yText = new Y.Text( yTextValue );

	// Y.Text objects must be attached to a Y.Doc in order to be used
	yMap.set( yTextKey, yText );

	return yText;
}
