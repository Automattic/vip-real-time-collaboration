import { BlockEditorStoreSelectors, store as blockEditorStore } from '@wordpress/block-editor';
import { useSelect } from '@wordpress/data';
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

	const blocksToHighlight = userStates
		.map( userState => {
			if ( userState.editorState?.selectedBlockId ) {
				return {
					blockId: userState.editorState.selectedBlockId,
					color: userState.color,
				};
			}

			return null;
		} )
		.filter( block => block !== null );

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

		const selectedBlockIds = blocksToHighlight.map( block => block.blockId );
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

		blocksToHighlight.forEach( blockColorPair => {
			const { color, blockId } = blockColorPair;
			const blockElement = getBlockElementById( blockId );

			if ( blockElement ) {
				blockElement.style.boxShadow = `inset 0 0 0 2px ${ color }`;
				highlightedBlockIds.current.add( blockId );
			}
		} );
	}, [ blocksToHighlight, isEnabled ] );

	const selectedBlockId = useSelect< BlockEditorStoreSelectors, string | null >( select => {
		return select( blockEditorStore ).getSelectedBlockClientId();
	} );

	// Update the local state field when our selected block changes.
	useEffect( () => {
		const localState = awareness.getLocalState();
		const userState = localState?.userState as UserState | undefined;

		if ( userState ) {
			awareness.setLocalStateField( 'userState', {
				...userState,
				editorState: {
					...userState.editorState,
					selectedBlockId,
				},
			} );
		}
	}, [ selectedBlockId ] );
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
