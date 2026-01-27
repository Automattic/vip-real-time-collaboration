import '@wordpress/core-data';
import { User } from '@wordpress/core-data';
import type { EnhancedState } from '@wordpress/sync';
import type * as Y from 'yjs';

declare module '@wordpress/core-data' {
	export const store: {
		name: string;
	};

	export interface CoreDataSelectors {
		getCurrentUser(): User;
	}

	// Types from awareness/types.ts
	export type UserInfo = Pick<
		User< 'view' >,
		'id' | 'name' | 'slug' | 'avatar_urls'
	> & {
		browserType: string;
		color: string;
		enteredAt: number;
	};

	export interface BaseState {
		userInfo: UserInfo;
	}

	export interface EditorState {
		selection: SelectionState;
	}

	export interface PostEditorState extends BaseState {
		editorState?: EditorState;
	}

	// Types from utils/crdt-user-selections.ts
	export enum SelectionType {
		None = 'none',
		Cursor = 'cursor',
		SelectionInOneBlock = 'selection-in-one-block',
		SelectionInMultipleBlocks = 'selection-in-multiple-blocks',
		WholeBlock = 'whole-block',
	}

	export type CursorPosition = {
		relativePosition: Y.RelativePosition;
		absoluteOffset: number;
	};

	export type SelectionNone = {
		type: SelectionType.None;
	};

	export type SelectionCursor = {
		type: SelectionType.Cursor;
		blockId: string;
		cursorPosition: CursorPosition;
	};

	export type SelectionInOneBlock = {
		type: SelectionType.SelectionInOneBlock;
		blockId: string;
		cursorStartPosition: CursorPosition;
		cursorEndPosition: CursorPosition;
	};

	export type SelectionInMultipleBlocks = {
		type: SelectionType.SelectionInMultipleBlocks;
		blockStartId: string;
		blockEndId: string;
		cursorStartPosition: CursorPosition;
		cursorEndPosition: CursorPosition;
	};

	export type SelectionWholeBlock = {
		type: SelectionType.WholeBlock;
		blockId: string;
	};

	export type SelectionState =
		| SelectionNone
		| SelectionCursor
		| SelectionInOneBlock
		| SelectionInMultipleBlocks
		| SelectionWholeBlock;

	// Hooks
	export function useActiveUsers( postId: number | null, postType: string | null ): EnhancedState< PostEditorState >[];
	export function useGetAbsolutePositionIndex( postId: number | null, postType: string | null ): ( selection: SelectionCursor ) => number | null;
	export function useIsDisconnected( postId: number | null, postType: string | null ): boolean;
}
