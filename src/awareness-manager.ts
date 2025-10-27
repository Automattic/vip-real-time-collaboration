/**
 * External dependencies
 */
import { type BlockEditorStoreSelectors, store as blockEditorStore } from '@wordpress/block-editor';
import { dispatch, select, subscribe } from '@wordpress/data';
import { WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';
import * as Y from 'yjs';

/**
 * Internal dependencies
 */
import {
	type UserInfo,
	type UserState,
	type WordPressUserInfo,
	store as awarenessStore,
} from '@/store/awareness-store';
import { getBrowserName } from '@/utilities/browser';
import {
	AWARENESS_CURSOR_UPDATE_DEBOUNCE_IN_MS,
	LOCAL_CURSOR_UPDATE_DEBOUNCE_IN_MS,
	REMOVAL_DELAY_IN_MS,
} from '@/utilities/config';
import { getCurrentUserInfo } from '@/utilities/entity';
import { Logger } from '@/utilities/logger';
import {
	getPostRestoredNotificationContent,
	getPostUpdatedNotificationContent,
	NotificationType,
	sendNotification,
} from '@/utilities/notifications';
import {
	getSelectionState,
	SelectableBlock,
	updateSelectionInEntityRecord,
} from '@/utilities/selection';
import { getNewUserColor } from '@/utilities/user-color';

import type { Awareness } from 'y-protocols/awareness';

type AwarenessClientID = number;

interface AwarenessStateChange {
	added: AwarenessClientID[];
	updated: AwarenessClientID[];
	removed: AwarenessClientID[];
}

export class AwarenessManager {
	private static __instance: AwarenessManager;
	private logger: Logger = new Logger( 'awareness-manager' );

	private constructor( private awareness: Awareness, private userInfo: WordPressUserInfo ) {
		this.setCurrentUserState();
		this.refreshAwareness();
		this.subscribeToCRDTChanges();
		this.subscribeToSelectionChanges();
		this.subscribeToUserChanges();
	}

	public static async initialize( awareness: Awareness ): Promise< void > {
		if ( AwarenessManager.__instance ) {
			AwarenessManager.__instance.logger.error(
				`AwarenessManager was created more than once for client ID ${ awareness.clientID }.`
			);
			return;
		}

		AwarenessManager.__instance = new AwarenessManager( awareness, await getCurrentUserInfo() );
	}

	public static setConnectionStatus( clientId: number, isConnected: boolean ): void {
		if ( clientId !== AwarenessManager.__instance?.awareness.clientID ) {
			return;
		}

		const { patchUserInfo } = dispatch( awarenessStore );
		void patchUserInfo( clientId, { isConnected } );
	}

	public static convertRelativePositionToAbsolutePosition(
		position: Y.RelativePosition
	): Y.AbsolutePosition | null {
		if ( ! AwarenessManager.__instance?.awareness?.doc ) {
			console.error( 'convertRelativePositionToAbsolutePosition() awareness document not found' );
			return null;
		}

		return Y.createAbsolutePositionFromRelativePosition(
			position,
			AwarenessManager.__instance.awareness.doc
		);
	}

	private setCurrentUserState(): void {
		const states = this.getStates();
		const otherUserColors = Array.from( states.values() )
			.filter( userState => userState.userInfo && ! userState.userInfo.isMe )
			.map( userState => userState.userInfo.color )
			.filter( Boolean );

		const userInfo: UserInfo = {
			...this.userInfo,
			browserType: getBrowserName(),
			clientId: this.awareness.clientID,
			color: getNewUserColor( otherUserColors ),
			isConnected: true,
			isMe: true,
		};

		this.setLocalStateField( 'userInfo', userInfo );
	}

	/**
	 * Get the states from an awareness document.
	 */
	private getStates(): Map< number, UserState > {
		return this.awareness.getStates() as Map< number, UserState >;
	}

	/**
	 * Set a local state field on an awareness document.
	 */
	private setLocalStateField< FieldName extends keyof UserState >(
		field: FieldName,
		value: UserState[ FieldName ]
	): void {
		this.awareness.setLocalStateField( field, value );
	}

	private refreshAwareness(): void {
		const { removeUser, upsertUser } = dispatch( awarenessStore );
		const { getActiveClientIds } = select( awarenessStore );

		const clientIdsFromStore = new Set< number >( getActiveClientIds() );
		const clientIdsFromAwareness = new Set< number >();

		this.getStates().forEach( ( userState, clientId ) => {
			// The initial state may contain invalid state, so we validate it and
			// skip logging since the origin of the state is not from us.
			if ( ! this.validateUserState( userState ) ) {
				return;
			}

			userState.userInfo.isMe = userState.userInfo.clientId === this.awareness.clientID;

			void upsertUser( clientId, userState );
			clientIdsFromAwareness.add( clientId );
		} );

		// Remove users that are in the store but not in the awareness instance.
		clientIdsFromStore.forEach( clientId => {
			if ( ! clientIdsFromAwareness.has( clientId ) ) {
				void removeUser( clientId );
			}
		} );
	}

	private subscribeToCRDTChanges(): void {
		const now = Date.now();
		const recordMap = this.awareness.doc.getMap( 'document' );
		const stateMap = this.awareness.doc.getMap( 'state' );

		stateMap.observe( ( event: Y.YMapEvent< unknown >, transaction: Y.Transaction ) => {
			event.keysChanged.forEach( ( key: string ) => {
				switch ( key ) {
					// A remote user has persisted the document (saved).
					case 'persistedAt': {
						if ( transaction.local ) {
							break;
						}

						const remoteClientId = stateMap.get( 'persistedBy' ) as number;
						const userState = this.getStates().get( remoteClientId );
						this.logger.debug( `Document was persisted by client ID ${ remoteClientId }.`, {
							remoteClientId,
							userState,
							stateMap,
						} );

						if (
							// Ignore if the persistedAt timestamp is older than our session
							now > ( stateMap.get( 'persistedAt' ) as number ) ||
							// Ignore if we don't have a user state for the client ID
							! userState ||
							// Ignore if this is our own persisted event (can happen on refresh or reconnect)
							userState.userInfo.id === this.userInfo.id
						) {
							break;
						}

						const status = recordMap.get( 'status' ) as string;
						const content = getPostUpdatedNotificationContent( userState.userInfo, status );
						sendNotification( content, userState.userInfo, NotificationType.PostUpdated );

						break;
					}

					// A remote user has restored the document (restored a revision or loaded newer content).
					case 'restoredAt': {
						const remoteClientId = stateMap.get( 'restoredBy' ) as number;
						const userState = this.getStates().get( remoteClientId );
						this.logger.debug( `Document was restored by client ID ${ remoteClientId }.`, {
							remoteClientId,
							userState,
							stateMap,
						} );

						if (
							// Ignore if the restoredAt timestamp is older than our session
							now > ( stateMap.get( 'restoredAt' ) as number ) ||
							// Ignore if we don't have a user state for the client ID
							! userState
						) {
							break;
						}

						const content = getPostRestoredNotificationContent( userState.userInfo );
						sendNotification( content, userState.userInfo, NotificationType.PostRestored );

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
		const { updateEditorState } = dispatch( awarenessStore );

		const ydocument = this.awareness.doc.getMap( 'document' );
		const yBlocks = ydocument.get( 'blocks' ) as Y.Array< SelectableBlock >;
		const editorState = {
			selection: getSelectionState( selectionStart, selectionEnd, yBlocks ),
		};

		// Update local state with the new selection state.
		void updateEditorState( this.awareness.clientID, editorState );

		// Throttle awareness updates.
		let awarenessCursorTimeout: NodeJS.Timeout | null = null;
		let pendingEditorState: { selection: ReturnType< typeof getSelectionState > } | null = null;

		// Store the most recent editor state for awareness throttle
		pendingEditorState = editorState;

		// Throttle awareness updates - only set timeout if one isn't already running
		if ( ! awarenessCursorTimeout ) {
			awarenessCursorTimeout = setTimeout( () => {
				if ( pendingEditorState ) {
					this.setLocalStateField( 'editorState', pendingEditorState );
					pendingEditorState = null;
				}
				awarenessCursorTimeout = null;
			}, AWARENESS_CURSOR_UPDATE_DEBOUNCE_IN_MS );
		}
	}

	private subscribeToUserChanges(): void {
		const userRemovalTimeouts = new Map< number, NodeJS.Timeout >();
		const { patchUserInfo, removeUser, upsertUser } = dispatch( awarenessStore );

		this.awareness.on( 'change', ( { added, removed, updated }: AwarenessStateChange ) => {
			const updatedUserStates = this.getStates();

			[ ...added, ...updated ].forEach( id => {
				const userState = updatedUserStates.get( id );

				if ( userRemovalTimeouts.has( id ) ) {
					clearTimeout( userRemovalTimeouts.get( id ) );
					userRemovalTimeouts.delete( id );
				}

				if ( ! this.validateUserState( userState ) ) {
					return;
				}

				// If this is the current user, ignore most state updates. We handle our own state locally.
				if ( userState.userInfo.clientId === this.awareness.clientID ) {
					// Except reconnection updates, which we receive from awareness.
					// This is necessary when reconnecting after a short timeout, where we
					// receive back-to-back 'removed' and 'added' events for ourselves.
					if ( userState.userInfo.isConnected === true ) {
						void patchUserInfo( id, {
							isConnected: true,
						} );
					}

					return;
				}

				userState.userInfo.isConnected = true;
				userState.userInfo.isMe = false;

				void upsertUser( id, userState );
			} );

			removed.forEach( id => {
				// When a user is removed, we don't want to immediately remove their
				// state. Instead, we set a timeout to remove it after a short delay.
				if ( userRemovalTimeouts.has( id ) ) {
					return;
				}

				void patchUserInfo( id, {
					isConnected: false,
				} );

				userRemovalTimeouts.set(
					id,
					setTimeout( () => {
						userRemovalTimeouts.delete( id );
						void removeUser( id );
					}, REMOVAL_DELAY_IN_MS )
				);
			} );
		} );
	}

	private validateUserState( userState: UserState | undefined ): userState is UserState {
		// User state can be set to an empty object by the Yjs awareness protocol
		// when the user disconnects.
		if ( ! userState?.userInfo.clientId || ! userState?.userInfo.id ) {
			return false;
		}

		return true;
	}
}
