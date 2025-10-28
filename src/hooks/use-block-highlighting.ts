import { useSelect } from '@wordpress/data';
import { useEffect, useRef } from '@wordpress/element';

import {
	store as rtcSettingsStore,
	Setting,
	SettingsStoreSelectors,
} from '../store/settings-store';
import {
	AwarenessStoreSelectors,
	UserState,
	store as awarenessStore,
} from '@/store/awareness-store';
import { SelectionType, type SelectionWholeBlock } from '@/utilities/selection';

/**
 * Custom hook for highlighting selected blocks in the editor
 * @param blockEditorDocument - Ref to the block editor document, used to directly style block elements.
 */
export function useBlockHighlighting( blockEditorDocument: Document | null ) {
	const highlightedBlockIds = useRef< Set< string > >( new Set() );
	const userStates = useSelect< AwarenessStoreSelectors, UserState[] >( select => {
		return Array.from( select( awarenessStore ).getActiveUsers().values() );
	} );

	const { isAwarenessCursorsEnabled, isSelfAwarenessEnabled } = useSelect<
		SettingsStoreSelectors,
		{ isAwarenessCursorsEnabled: boolean; isSelfAwarenessEnabled: boolean }
	>( select => {
		const { getSetting } = select( rtcSettingsStore );
		return {
			isAwarenessCursorsEnabled: getSetting( Setting.AWARENESS_CURSORS ),
			isSelfAwarenessEnabled: getSetting( Setting.SELF_AWARENESS ),
		};
	}, [] );

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
				const isWholeBlockSelected =
					userState.editorState?.selection?.type === SelectionType.WholeBlock;
				const shouldDrawUser = userState.userInfo.isMe ? isSelfAwarenessEnabled : true;

				if ( isWholeBlockSelected && shouldDrawUser ) {
					const selection = userState.editorState?.selection as SelectionWholeBlock;

					return {
						blockId: selection.blockId,
						color: userState.userInfo.color,
					};
				}

				return null;
			} )
			.filter( block => block !== null );

		if ( ! isAwarenessCursorsEnabled ) {
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
	}, [ userStates, isAwarenessCursorsEnabled, isSelfAwarenessEnabled, blockEditorDocument ] );
}

const getBlockElementById = (
	blockEditorDocument: Document,
	blockId: string
): HTMLElement | null => {
	return blockEditorDocument.querySelector( `[data-block="${ blockId }"]` );
};
