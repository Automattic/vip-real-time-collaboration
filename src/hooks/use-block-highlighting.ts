import { BlockEditorStoreSelectors, store as blockEditorStore } from '@wordpress/block-editor';
import { store as coreStore, CoreDataSelectors } from '@wordpress/core-data';
import { useSelect } from '@wordpress/data';
import { useEffect, useRef } from '@wordpress/element';
import { type SyncProvider } from '@wordpress/sync';

import {
	AwarenessStoreSelectors,
	EditorState,
	store as awarenessStore,
} from '@/store/awareness-store';

const USER_HIGHLIGHT_ALPHA = 'AA'; // 00-FF for #RRGGBBAA-type colors
const USER_COLORS = [
	`#000000${ USER_HIGHLIGHT_ALPHA }`,
	`#000000${ USER_HIGHLIGHT_ALPHA }`,
	`#51CD00${ USER_HIGHLIGHT_ALPHA }`,
	`#FD4BDA${ USER_HIGHLIGHT_ALPHA }`,
	`#FF9F00${ USER_HIGHLIGHT_ALPHA }`,
	`#37ADFF${ USER_HIGHLIGHT_ALPHA }`,
];

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
	const editorStates = useSelect< AwarenessStoreSelectors, EditorState[] >( select => {
		return select( awarenessStore ).getEditorStates();
	} );

	useEffect( () => {
		if ( ! isEnabled ) {
			Array.from( highlightedBlockIds.current ).forEach( blockId => {
				const blockElement = getEditorDocument().querySelector(
					`[data-block="${ blockId }"]`
				) as HTMLElement;

				if ( blockElement ) {
					blockElement.style.boxShadow = '';
				}

				highlightedBlockIds.current.delete( blockId );
			} );

			return;
		}

		const selectedBlockIds = editorStates.map( editorState => editorState.selectedBlockId );
		const blocksIdsToUnhighlight = Array.from( highlightedBlockIds.current ).filter(
			blockId => ! selectedBlockIds.includes( blockId )
		);

		blocksIdsToUnhighlight.forEach( blockId => {
			const blockElement = getEditorDocument().querySelector(
				`[data-block="${ blockId }"]`
			) as HTMLElement;

			if ( blockElement ) {
				blockElement.style.boxShadow = '';
			}

			highlightedBlockIds.current.delete( blockId );
		} );

		editorStates.forEach( ( { selectedBlockId, editorColor } ) => {
			if ( selectedBlockId === undefined ) {
				return;
			}

			const blockElement = getEditorDocument().querySelector(
				`[data-block="${ selectedBlockId }"]`
			) as HTMLElement;

			if ( blockElement ) {
				blockElement.style.boxShadow = `inset 0 0 0 2px ${ editorColor ?? USER_COLORS[ 0 ] }`;
				highlightedBlockIds.current.add( selectedBlockId );
			}
		} );
	}, [ editorStates, isEnabled ] );

	const selectedBlockId = useSelect< BlockEditorStoreSelectors, string | null >( select => {
		return select( blockEditorStore ).getSelectedBlockClientId();
	} );

	const userId = useSelect< CoreDataSelectors, number >( select => {
		return select( coreStore ).getCurrentUser().id;
	} );

	useEffect( () => {
		// highlightBlock( selectedBlockId );

		if ( userId ) {
			const myColor = USER_COLORS[ userId % USER_COLORS.length ];
			awareness.setLocalStateField( 'editorState', {
				selectedBlockId,
				editorColor: myColor,
			} );
		}
	}, [ selectedBlockId, userId ] );
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
