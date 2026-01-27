import '@wordpress/core-data';
import { User } from '@wordpress/core-data';
import type { EnhancedState } from '@wordpress/sync';
import type * as Y from 'yjs';

declare module '@wordpress/core-data' {
	const store: {
		name: string;
	};

	interface CoreDataSelectors {
		getCurrentUser(): User;
	}

	// Types from awareness/types.ts
	type UserInfo = Pick< User< 'view' >, 'id' | 'name' | 'slug' | 'avatar_urls' > & {
		browserType: string;
		color: string;
		enteredAt: number;
	};

	interface BaseState {
		userInfo: UserInfo;
	}

	interface EditorState {
		selection: SelectionState;
	}

	interface PostEditorState extends BaseState {
		editorState?: EditorState;
	}

	type PostEditorAwarenessState = EnhancedState< PostEditorState >;

	// Types from types.ts (Selection types)
	type CursorPosition = {
		relativePosition: Y.RelativePosition;
		absoluteOffset: number;
	};

	enum SelectionType {
		None = 'none',
		Cursor = 'cursor',
		SelectionInOneBlock = 'selection-in-one-block',
		SelectionInMultipleBlocks = 'selection-in-multiple-blocks',
		WholeBlock = 'whole-block',
	}

	type SelectionNone = {
		type: SelectionType.None;
	};

	type SelectionCursor = {
		type: SelectionType.Cursor;
		blockId: string;
		cursorPosition: CursorPosition;
	};

	type SelectionInOneBlock = {
		type: SelectionType.SelectionInOneBlock;
		blockId: string;
		cursorStartPosition: CursorPosition;
		cursorEndPosition: CursorPosition;
	};

	type SelectionInMultipleBlocks = {
		type: SelectionType.SelectionInMultipleBlocks;
		blockStartId: string;
		blockEndId: string;
		cursorStartPosition: CursorPosition;
		cursorEndPosition: CursorPosition;
	};

	type SelectionWholeBlock = {
		type: SelectionType.WholeBlock;
		blockId: string;
	};

	type SelectionState =
		| SelectionNone
		| SelectionCursor
		| SelectionInOneBlock
		| SelectionInMultipleBlocks
		| SelectionWholeBlock;

	// Hooks
	function useActiveUsers(
		postId: number | null,
		postType: string | null
	): EnhancedState< PostEditorState >[];

	function useGetAbsolutePositionIndex(
		postId: number | null,
		postType: string | null
	): ( selection: SelectionCursor ) => number | null;

	function useIsDisconnected( postId: number | null, postType: string | null ): boolean;
}
