import { useSelect } from '@wordpress/data';
import { useEffect, useRef } from '@wordpress/element';

import { SelectionType } from './use-render-cursors';
import {
	AwarenessStoreSelectors,
	UserState,
	store as awarenessStore,
} from '@/store/awareness-store';

/**
 * Custom hook for highlighting selected blocks in the editor
 * @param blockEditorDocument - Ref to the block editor document, used to directly style block elements.
 * @param isEnabled - Whether the highlighting is enabled
 */
export function useBlockHighlighting( blockEditorDocument: Document | null, isEnabled: boolean ) {
	const highlightedBlockIds = useRef< Set< string > >( new Set() );
	const userStates = useSelect< AwarenessStoreSelectors, UserState[] >( select => {
		return select( awarenessStore ).getActiveUsers();
	} );

	// Draw block highlights
	useEffect( () => {
		// Don't do anything if editor is not rendered yet.
		if ( blockEditorDocument === null ) {
			return;
		}

		const unhighlightBlocks = ( blockIds: string[] ) => {
			blockIds.forEach( blockId => {
				const blockElement = getBlockElementById( blockEditorDocument, blockId );

				if ( blockElement ) {
					blockElement.style.boxShadow = '';
					blockElement.style.borderRadius = '';
				}

				highlightedBlockIds.current.delete( blockId );
			} );
		};

		const blocksToHighlight = userStates
			.map( userState => {
				if ( userState.editorState?.selection?.type === SelectionType.Cursor ) {
					return {
						blockId: userState.editorState.selection.blockId,
						color: userState.color,
					};
				}

				return null;
			} )
			.filter( block => block !== null );

		if ( ! isEnabled ) {
			// If the overlay is disabled, remove all highlights.
			unhighlightBlocks( Array.from( highlightedBlockIds.current ) );
			return;
		}

		// Unhighlight blocks that are no longer highlighted.
		const selectedBlockIds = blocksToHighlight.map( block => block.blockId );
		const blocksIdsToUnhighlight = Array.from( highlightedBlockIds.current ).filter(
			blockId => ! selectedBlockIds.includes( blockId )
		);

		unhighlightBlocks( blocksIdsToUnhighlight );

		// Highlight blocks that are currently highlighted.
		if ( userStates.length === 1 ) {
			// Don't highlight anything if we're the only user.
			return;
		}

		blocksToHighlight.forEach( blockColorPair => {
			const { color, blockId } = blockColorPair;
			const blockElement = getBlockElementById( blockEditorDocument, blockId );

			if ( ! blockElement ) {
				return;
			}

			if ( blockElement ) {
				blockElement.style.boxShadow = `${ color } 0 0 0 2px`;
				blockElement.style.borderRadius = '4px';
				highlightedBlockIds.current.add( blockId );
			}
		} );
	}, [ userStates, isEnabled, blockEditorDocument ] );
}

const getBlockElementById = (
	blockEditorDocument: Document,
	blockId: string
): HTMLElement | null => {
	return blockEditorDocument.querySelector( `[data-block="${ blockId }"]` );
};
