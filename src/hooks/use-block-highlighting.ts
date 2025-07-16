import { BlockEditorStoreSelectors, store as blockEditorStore } from '@wordpress/block-editor';
import { store as coreStore, CoreDataSelectors } from '@wordpress/core-data';
import { useSelect } from '@wordpress/data';
import { WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';
import { useEffect, useRef } from '@wordpress/element';
import { type SyncProvider } from '@wordpress/sync';

import {
	AwarenessStoreSelectors,
	UserState,
	store as awarenessStore,
} from '@/store/awareness-store';

/**
 * Custom hook for highlighting selected blocks in the editor
 * @param awareness - The awareness instance
 * @param isEnabled - Whether the highlighting is enabled
 */
export function useBlockHighlighting(
	awareness: SyncProvider[ 'awareness' ],
	isEnabled: boolean = true
) {
	const highlightedBlockIds = useRef< Set< string > >( new Set() );
	const userStates = useSelect< AwarenessStoreSelectors, UserState[] >( select => {
		return select( awarenessStore ).getActiveUsers();
	} );

	useEffect( () => {
		if ( ! isEnabled ) {
			Array.from( highlightedBlockIds.current ).forEach( blockId => {
				const blockElement = getBlockElementById( blockId );

				if ( blockElement ) {
					blockElement.style.boxShadow = '';
				}

				highlightedBlockIds.current.delete( blockId );
			} );

			return;
		}

		const selectedBlockIds = userStates
			.map( userState => userState.editorState?.selectedBlockId ?? null )
			.filter( blockId => blockId !== null );

		const blocksIdsToUnhighlight = Array.from( highlightedBlockIds.current ).filter(
			blockId => ! selectedBlockIds.includes( blockId )
		);

		blocksIdsToUnhighlight.forEach( blockId => {
			const blockElement = getBlockElementById( blockId );

			if ( blockElement ) {
				blockElement.style.boxShadow = '';
			}

			highlightedBlockIds.current.delete( blockId );
		} );

		userStates.forEach( userState => {
			const {
				color,
				editorState: { selectedBlockId },
			} = userState;

			if ( selectedBlockId === undefined ) {
				return;
			}

			const blockElement = getBlockElementById( selectedBlockId );

			if ( blockElement ) {
				blockElement.style.boxShadow = `inset 0 0 0 2px ${ color }`;
				highlightedBlockIds.current.add( selectedBlockId );
			}
		} );
	}, [ userStates, isEnabled ] );

	const { selectedBlockId, selectionStart } = useSelect<
		BlockEditorStoreSelectors,
		{ selectedBlockId: string | null; selectionStart: WPBlockSelection }
	>( select => {
		const { getSelectedBlockClientId, getSelectionStart } = select( blockEditorStore );
		return {
			selectedBlockId: getSelectedBlockClientId(),
			selectionStart: getSelectionStart(),
		};
	} );

	const userId = useSelect< CoreDataSelectors, number >( select => {
		return select( coreStore ).getCurrentUser().id;
	} );

	useEffect( () => {
		if ( userId ) {
			const localState = awareness.getLocalState();
			const userState = localState?.userState as UserState | undefined;

			if ( userState ) {
				awareness.setLocalStateField( 'userState', {
					...userState,
					editorState: {
						...userState.editorState,
						selectedBlockId,
						selection: {
							startOffset: selectionStart.offset,
						},
					},
				} );
			}
		}
	}, [ selectedBlockId, selectionStart.offset, userId ] );
}

// Get the editor document context from iframe or the main document for element styling
const getEditorDocument = (): Document => {
	const iframeSelectors = [ 'iframe[name="editor-canvas"]', 'iframe.editor-canvas' ];

	for ( const selector of iframeSelectors ) {
		const editorFrame = document.querySelector( selector ) as HTMLIFrameElement;
		if ( editorFrame?.contentDocument ) {
			return editorFrame.contentDocument;
		}
	}

	// Fallback to main document (for non-iframed editors)
	return document;
};

const getBlockElementById = ( blockId: string ): HTMLElement | null => {
	return getEditorDocument().querySelector( `[data-block="${ blockId }"]` );
};
