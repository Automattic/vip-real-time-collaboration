/**
 * External dependencies
 */
import { useSelect } from '@wordpress/data';
import { store as editorStore, type EditorStoreSelectors } from '@wordpress/editor';
import { useEffect, useMemo, useState } from '@wordpress/element';
import * as Y from 'yjs';

/**
 * Internal dependencies
 */
import { getPostEditorAwareness } from '@/awareness/awareness-manager';
import { getDebugData, type YDocDebugData } from '@/awareness/awareness-utils';

import type { EnhancedState, PostEditorState } from '@/awareness/awareness-types';
import type { SelectionCursor } from '@/utilities/selection';

interface PostEditorAwarenessState {
	activeUsers: EnhancedState< PostEditorState >[];
	getDebugData: () => YDocDebugData | null;
	isCurrentUserDisconnected: boolean;
}

interface PostDetails {
	postId: number | null;
	postType: string | null;
}

const defaultState: PostEditorAwarenessState = {
	activeUsers: [],
	getDebugData: () => null,
	isCurrentUserDisconnected: false,
};

function usePostDetails(): PostDetails {
	return useSelect< EditorStoreSelectors, PostDetails >( select => {
		const editorStoreSelectors = select( editorStore );
		return {
			postId: editorStoreSelectors.getCurrentPostId(),
			postType: editorStoreSelectors.getCurrentPostType(),
		};
	}, [] );
}

function usePostEditorAwarenessState(): PostEditorAwarenessState {
	const [ state, setState ] = useState< PostEditorAwarenessState >( defaultState );
	const { postId, postType } = usePostDetails();

	useEffect( () => {
		if ( null === postId || null === postType ) {
			return;
		}

		const awareness = getPostEditorAwareness( postId, postType );
		const unsubscribe = awareness?.onStateChange(
			( newState: EnhancedState< PostEditorState >[] ) => {
				setState( {
					activeUsers: newState,
					getDebugData: () => getDebugData( awareness ),
					isCurrentUserDisconnected: newState.find( user => user.isMe )?.isConnected === false,
				} );
			}
		);

		return unsubscribe;
	}, [ postId, postType ] );

	return state;
}

export function useActiveUsers(): EnhancedState< PostEditorState >[] {
	return usePostEditorAwarenessState().activeUsers;
}

export function useGetAbsolutePositionIndex(): ( selection: SelectionCursor ) => number | null {
	const { postId, postType } = usePostDetails();

	return useMemo( () => {
		const defaultValue = () => null;

		if ( null === postId || null === postType ) {
			return defaultValue;
		}

		const awareness = getPostEditorAwareness( postId, postType );

		if ( ! awareness ) {
			return defaultValue;
		}

		return ( selection: SelectionCursor ): number | null =>
			Y.createAbsolutePositionFromRelativePosition(
				selection.cursorPosition.relativePosition,
				awareness.doc
			)?.index ?? null;
	}, [ postId, postType ] );
}

export function useGetDebugData(): () => YDocDebugData | null {
	return usePostEditorAwarenessState().getDebugData;
}

export function useIsDisconnected(): boolean {
	return usePostEditorAwarenessState().isCurrentUserDisconnected;
}
