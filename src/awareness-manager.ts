/**
 * External dependencies
 */
import { type BlockEditorStoreSelectors, store as blockEditorStore } from '@wordpress/block-editor';
import { dispatch, select, subscribe } from '@wordpress/data';
import { WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';
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
import { NotificationType, sendNotification } from '@/utilities/notifications';
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

// Type for serializable left/right item references to avoid deep nesting
type SerializableYItemRef = Pick< Y.Item, 'id' | 'length' | 'origin' | 'content' >;

// Serializable Y.Item - only includes data properties with shallow left/right references
type SerializableYItem = Pick<
	Y.Item,
	| 'id'
	| 'length'
	| 'origin'
	| 'rightOrigin'
	| 'parent'
	| 'parentSub'
	| 'redone'
	| 'content'
	| 'info'
> & {
	left: SerializableYItemRef | null;
	right: SerializableYItemRef | null;
};

// WordPress user info for debug export (subset of UserInfo from awareness-store)
interface WpUserData {
	wpUserId: number;
	name: string;
	email: string;
}

interface YDocDebugData {
	doc: Record< string, unknown >;
	clients: Record< number, Array< SerializableYItem > >;
	userMap: Record< string, WpUserData >;
}

/**
 * Type guard to check if a struct is a Y.Item (not Y.GC)
 */
function isYItem( struct: Y.Item | Y.GC ): struct is Y.Item {
	return 'content' in struct;
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

	public static getDebugData(): YDocDebugData | null {
		const logger = new Logger( 'awareness-manager' );
		if ( ! AwarenessManager.__instance?.awareness?.doc ) {
			logger.error( 'getDebugData() awareness document not found' );
			return null;
		}

		const ydoc = AwarenessManager.__instance.awareness.doc;

		// Manually extract doc data to avoid deprecated toJSON method
		const docData: Record< string, unknown > = {};
		ydoc.share.forEach( ( value, key ) => {
			docData[ key ] = value.toJSON();
		} );

		// Build userMap from awareness store (all users seen this session)
		const { getSeenUsers } = select( awarenessStore );
		const allSeenUsers = getSeenUsers(); // Returns userMap with all seen users
		const userMapData = new Map< string, WpUserData >();

		allSeenUsers.forEach( ( userState, clientId ) => {
			userMapData.set( String( clientId ), {
				wpUserId: userState.userInfo.id,
				name: userState.userInfo.name,
				email: userState.userInfo.email,
			} );
		} );

		// Serialize Yjs client items to avoid deep nesting
		const serializableClientItems: Record< number, Array< SerializableYItem > > = {};

		ydoc.store.clients.forEach( ( structs, clientId ) => {
			// Filter for Y.Item only (skip Y.GC garbage collection structs)
			const items = structs.filter( isYItem );

			// eslint-disable-next-line security/detect-object-injection -- clientId is a number from Yjs, not user input
			serializableClientItems[ clientId ] = items.map( item => {
				const { left, right, ...rest } = item;

				return {
					...rest,
					left: left
						? { id: left.id, length: left.length, origin: left.origin, content: left.content }
						: null,
					right: right
						? { id: right.id, length: right.length, origin: right.origin, content: right.content }
						: null,
				};
			} );
		} );

		return {
			doc: docData,
			clients: serializableClientItems,
			userMap: Object.fromEntries( userMapData ),
		};
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
			enteredAt: Date.now(),
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
		const recordMap = this.awareness.doc.getMap( RECORD_KEY );
		const recordMeta = this.awareness.doc.getMap( RECORD_METADATA_KEY );

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
							userState.userInfo.id === this.userInfo.id
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
		const { updateEditorState } = dispatch( awarenessStore );

		const ydocument = this.awareness.doc.getMap( RECORD_KEY );
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
		if ( ! userState?.userInfo?.clientId || ! userState?.userInfo?.id ) {
			return false;
		}

		return true;
	}
}
