/**
 * External dependencies
 */
import { useSelect } from '@wordpress/data';
import { store as editorStore, type EditorStoreSelectors } from '@wordpress/editor';
import { useEffect, useState } from '@wordpress/element';
import { __dangerousOptInToUnstableAPIsOnlyForCoreModules } from '@wordpress/private-apis';
import { privateApis as syncPrivateApis, type Y as _Y } from '@wordpress/sync';

const { unlock } = __dangerousOptInToUnstableAPIsOnlyForCoreModules(
	'I acknowledge private features are not for use in themes or plugins and doing so will break in the next version of WordPress.',
	'@wordpress/sync'
);

const { Y } = unlock( syncPrivateApis ) as { Y: typeof _Y };

/**
 * Internal dependencies
 */
import { getPostEditorAwareness } from '@/awareness/awareness-manager';
import { getDebugData, type YDocDebugData } from '@/awareness/awareness-utils';

import type { EnhancedState, PostEditorState } from '@/awareness/awareness-types';
import type { SelectionCursor } from '@/utilities/selection';

interface PostEditorAwarenessState {
	activeUsers: EnhancedState< PostEditorState >[];
	getAbsolutePositionIndex: ( selection: SelectionCursor ) => number | null;
	getDebugData: () => YDocDebugData | null;
	isCurrentUserDisconnected: boolean;
}

interface EditorStoreSelectorResult {
	postId: number | null;
	postType: string | null;
}

const defaultState: PostEditorAwarenessState = {
	activeUsers: [],
	getAbsolutePositionIndex: () => null,
	getDebugData: () => null,
	isCurrentUserDisconnected: false,
};

function usePostEditorAwarenessState(): PostEditorAwarenessState {
	const [ state, setState ] = useState< PostEditorAwarenessState >( defaultState );
	const { postId, postType } = useSelect< EditorStoreSelectors, EditorStoreSelectorResult >(
		select => {
			const editorStoreSelectors = select( editorStore );
			return {
				postId: editorStoreSelectors.getCurrentPostId(),
				postType: editorStoreSelectors.getCurrentPostType(),
			};
		},
		[]
	);

	useEffect( () => {
		if ( null === postId || null === postType ) {
			return;
		}

		const awareness = getPostEditorAwareness( postId, postType );
		const unsubscribe = awareness?.onStateChange(
			( newState: EnhancedState< PostEditorState >[] ) => {
				setState( {
					activeUsers: newState,
					getAbsolutePositionIndex: ( selection: SelectionCursor ) =>
						Y.createAbsolutePositionFromRelativePosition(
							selection.cursorPosition.relativePosition,
							awareness.doc
						)?.index ?? null,
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
	return usePostEditorAwarenessState().getAbsolutePositionIndex;
}

export function useGetDebugData(): () => YDocDebugData | null {
	return usePostEditorAwarenessState().getDebugData;
}

export function useIsDisconnected(): boolean {
	return usePostEditorAwarenessState().isCurrentUserDisconnected;
}
