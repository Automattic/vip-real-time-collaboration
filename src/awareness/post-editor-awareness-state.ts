/**
 * External dependencies
 */
import { type BlockEditorStoreSelectors, store as blockEditorStore } from '@wordpress/block-editor';
import { select, subscribe } from '@wordpress/data';
import {
	CRDT_RECORD_MAP_KEY as RECORD_KEY,
	CRDT_RECORD_METADATA_MAP_KEY as RECORD_METADATA_KEY,
	CRDT_RECORD_METADATA_SAVED_AT_KEY as SAVED_AT_KEY,
	CRDT_RECORD_METADATA_SAVED_BY_KEY as SAVED_BY_KEY,
} from '@wordpress/sync';
import * as Y from 'yjs';

/**
 * Internal dependencies
 */
import { AwarenessState } from '@/awareness/awareness-state';
import {
	AWARENESS_CURSOR_UPDATE_THROTTLE_IN_MS,
	LOCAL_CURSOR_UPDATE_DEBOUNCE_IN_MS,
} from '@/utilities/config';
import { NotificationType, sendNotification } from '@/utilities/notifications';
import {
	getSelectionState,
	type YBlockProperties,
	updateSelectionInEntityRecord,
} from '@/utilities/selection';
import { areEditorStatesEqual, areUserInfosEqual } from '@/utilities/user';

import type { PostEditorState, UserInfo } from '@/awareness/awareness-types';
import type { WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';

export class PostEditorAwarenessState extends AwarenessState< PostEditorState > {
	protected equalityFieldChecks = {
		editorState: areEditorStatesEqual,
		userInfo: areUserInfosEqual,
	};

	public setUp( userInfo: UserInfo ): void {
		super.setUp( userInfo );

		this.subscribeToCRDTChanges();
		this.subscribeToSelectionChanges();
	}

	private subscribeToCRDTChanges(): void {
		const now = Date.now();
		const recordMap = this.doc.getMap( RECORD_KEY );
		const recordMeta = this.doc.getMap( RECORD_METADATA_KEY );

		recordMeta.observe( ( event: Y.YMapEvent< unknown >, transaction: Y.Transaction ) => {
			event.keysChanged.forEach( ( key: string ) => {
				switch ( key ) {
					// A remote user has saved the document.
					case SAVED_AT_KEY: {
						if ( transaction.local ) {
							break;
						}

						const savedTimestamp = recordMeta.get( SAVED_AT_KEY );
						const remoteClientId = recordMeta.get( SAVED_BY_KEY );

						// Type / "undefined" guard.
						if ( 'number' !== typeof remoteClientId || 'number' !== typeof savedTimestamp ) {
							break;
						}

						const userState = this.getStates().get( remoteClientId );

						if (
							// Ignore if the savedAt timestamp is older than our session
							now > savedTimestamp ||
							// Ignore if we don't have a user state for the client ID
							! userState ||
							// Ignore if this is our own saved event (can happen on refresh or reconnect)
							userState.userInfo.id === this.getLocalStateField( 'userInfo' )?.id
						) {
							break;
						}

						this.logger.debug( `Document was saved by client ID ${ remoteClientId }.`, {
							remoteClientId,
							userState,
							recordMeta,
						} );

						const status = recordMap.get( 'status' ) as string;
						sendNotification( NotificationType.PostUpdated, userState.userInfo, status );

						break;
					}
				}
			} );
		} );
	}

	private subscribeToSelectionChanges(): void {
		const { getSelectionStart, getSelectionEnd, getSelectedBlocksInitialCaretPosition } = select(
			blockEditorStore
		) as BlockEditorStoreSelectors;

		// Keep track of the current selection in the outer scope so we can compare
		// in the subscription.
		let selectionStart = getSelectionStart();
		let selectionEnd = getSelectionEnd();
		let localCursorTimeout: NodeJS.Timeout | null = null;

		subscribe( () => {
			const newSelectionStart = getSelectionStart();
			const newSelectionEnd = getSelectionEnd();

			if ( newSelectionStart === selectionStart && newSelectionEnd === selectionEnd ) {
				return;
			}

			selectionStart = newSelectionStart;
			selectionEnd = newSelectionEnd;

			// Typically selection position is only persisted after typing in a block, which
			// can cause selection position to be reset by other users making block updates.
			// Ensure we update the controlled selection right away, persisting our cursor position locally.
			void updateSelectionInEntityRecord(
				selectionStart,
				selectionEnd,
				getSelectedBlocksInitialCaretPosition()
			);

			// We receive two selection changes in quick succession
			// from local selection events:
			//   { clientId: "123...", attributeKey: "content", offset: undefined }
			//   { clientId: "123...", attributeKey: "content", offset: 554 }
			// Add a short debounce to avoid sending the first selection change.
			if ( localCursorTimeout ) {
				clearTimeout( localCursorTimeout );
			}

			localCursorTimeout = setTimeout( () => {
				this.updateSelectionState( selectionStart, selectionEnd );
			}, LOCAL_CURSOR_UPDATE_DEBOUNCE_IN_MS );
		} );
	}

	private updateSelectionState(
		selectionStart: WPBlockSelection,
		selectionEnd: WPBlockSelection
	): void {
		const ydoc = this.doc.getMap( RECORD_KEY );
		const blockProperties = ydoc.get( 'blockProperties' ) as YBlockProperties;
		const selection = getSelectionState( selectionStart, selectionEnd, blockProperties );

		// Throttle remote awareness updates.
		this.setThrottledLocalStateField(
			'editorState',
			{ selection },
			AWARENESS_CURSOR_UPDATE_THROTTLE_IN_MS
		);
	}
}
