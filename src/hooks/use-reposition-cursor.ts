import { type BlockEditorStoreSelectors, store as blockEditorStore } from '@wordpress/block-editor';
import { dispatch, select, subscribe, useSelect } from '@wordpress/data';
import { store as editorStore, type EditorStoreSelectors } from '@wordpress/editor';
import { type WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';
import { CRDT_RECORD_MAP_KEY } from '@wordpress/sync';
import { useEffect, useRef } from 'react';
import * as Y from 'yjs';

import { getPostEditorAwareness } from '@/awareness/awareness-manager';
import { type SelectableBlock, findBlockByClientId } from '@/utilities/selection';

interface ObserverState {
	yText: Y.Text | null;
	blockId: string | null;
	attributeKey: string | null;
	relativePosition: Y.RelativePosition | null;
	observeHandler: ( ( event: Y.YTextEvent, transaction: Y.Transaction ) => void ) | null;
}

/**
 * Custom hook that automatically repositions the cursor when other users type before
 * the current user's cursor position in the same block.
 *
 * This hook:
 * - Tracks the current user's cursor position using Y.RelativePosition
 * - Observes Y.Text changes in the current block
 * - Automatically moves the cursor when remote edits occur before the cursor
 */
export function useRepositionCursor() {
	const { postId, postType } = useSelect<
		EditorStoreSelectors,
		{ postId: number | null; postType: string | null }
	>( selectStore => {
		const editorStoreSelectors = selectStore( editorStore );
		return {
			postId: editorStoreSelectors.getCurrentPostId(),
			postType: editorStoreSelectors.getCurrentPostType(),
		};
	}, [] );

	// Track current observation state
	const observerRef = useRef< ObserverState >( {
		yText: null,
		blockId: null,
		attributeKey: null,
		relativePosition: null,
		observeHandler: null,
	} );

	useEffect( () => {
		if ( ! postId || ! postType ) {
			return;
		}

		const awareness = getPostEditorAwareness( postId, postType );
		if ( ! awareness ) {
			return;
		}

		const { getSelectionStart } = select( blockEditorStore ) as BlockEditorStoreSelectors;
		let previousSelection = getSelectionStart();

		const cleanupObserver = () => {
			if ( observerRef.current.yText && observerRef.current.observeHandler ) {
				observerRef.current.yText.unobserve( observerRef.current.observeHandler );
			}

			observerRef.current = {
				yText: null,
				blockId: null,
				attributeKey: null,
				relativePosition: null,
				observeHandler: null,
			};
		};

		const handleRemoteTextChange = () => {
			if ( ! observerRef.current.yText || ! observerRef.current.relativePosition ) {
				return;
			}

			const currentSelection = getSelectionStart();

			// Only reposition if we're still in the same block we're observing
			if (
				! currentSelection ||
				currentSelection.clientId !== observerRef.current.blockId ||
				currentSelection.attributeKey !== observerRef.current.attributeKey ||
				currentSelection.offset === undefined
			) {
				return;
			}

			// Convert relative position to absolute position
			const absolutePosition = Y.createAbsolutePositionFromRelativePosition(
				observerRef.current.relativePosition,
				awareness.doc
			);

			if ( ! absolutePosition ) {
				return;
			}

			const newAbsoluteOffset = absolutePosition.index;
			const oldAbsoluteOffset = currentSelection.offset;

			// Check if position actually changed
			if ( newAbsoluteOffset === oldAbsoluteOffset ) {
				return;
			}

			// Log the repositioning
			console.log( '[useRepositionCursor] Remote edit detected, repositioning cursor:', {
				blockId: currentSelection.clientId,
				attributeKey: currentSelection.attributeKey,
				oldOffset: oldAbsoluteOffset,
				newOffset: newAbsoluteOffset,
			} );

			// Move the cursor to the new position
			const { selectionChange } = dispatch( blockEditorStore );
			void selectionChange?.(
				currentSelection.clientId,
				currentSelection.attributeKey,
				newAbsoluteOffset,
				newAbsoluteOffset // Same start/end = cursor (not selection)
			);

			// Update stored relative position to the new position
			observerRef.current.relativePosition = Y.createRelativePositionFromTypeIndex(
				observerRef.current.yText,
				newAbsoluteOffset
			);
		};

		const updateTrackedBlock = ( selection: WPBlockSelection ) => {
			const documentMap = awareness.doc.getMap( CRDT_RECORD_MAP_KEY );
			const yBlocks = documentMap.get( 'blocks' ) as Y.Array< SelectableBlock >;

			// Find the block in Y.Array
			const block = findBlockByClientId( selection.clientId, yBlocks );
			if ( ! block ) {
				cleanupObserver();
				return;
			}

			const attributes = block.get( 'attributes' ) as Y.Map< Y.Text >;
			const yText = attributes.get( selection.attributeKey ) as Y.Text;

			if ( ! yText ) {
				cleanupObserver();
				return;
			}

			// If already observing the same Y.Text, just update the relative position
			if (
				observerRef.current.yText === yText &&
				observerRef.current.blockId === selection.clientId &&
				observerRef.current.attributeKey === selection.attributeKey
			) {
				// Just update the relative position without creating a new observer
				observerRef.current.relativePosition = Y.createRelativePositionFromTypeIndex(
					yText,
					selection.offset
				);
				return;
			}

			// Clean up previous observer if different block/attribute
			if ( observerRef.current.yText ) {
				cleanupObserver();
			}

			// Create relative position for current cursor
			const relativePosition = Y.createRelativePositionFromTypeIndex( yText, selection.offset );

			// Set up observer
			const observeHandler = ( event: Y.YTextEvent, transaction: Y.Transaction ) => {
				// Ignore local changes (our own typing)
				if ( transaction.local ) {
					return;
				}

				// Remote change detected
				handleRemoteTextChange();
			};

			yText.observe( observeHandler );

			// Store current state
			observerRef.current = {
				yText,
				blockId: selection.clientId,
				attributeKey: selection.attributeKey,
				relativePosition,
				observeHandler,
			};
		};

		// Provided type is generic `Function`.
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
		const unsubscribe = subscribe( () => {
			const newSelection = getSelectionStart();

			// Debounce: WordPress fires two selection events in quick succession
			if ( newSelection === previousSelection ) {
				return;
			}

			previousSelection = newSelection;

			// Only process cursor positions, not whole block selections
			if (
				! newSelection?.clientId ||
				! newSelection?.attributeKey ||
				newSelection.offset === undefined
			) {
				cleanupObserver();
				return;
			}

			// Update tracked block and Y.Text
			updateTrackedBlock( newSelection );
		} );

		return () => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			unsubscribe();
			cleanupObserver();
		};
	}, [ postId, postType ] );
}
