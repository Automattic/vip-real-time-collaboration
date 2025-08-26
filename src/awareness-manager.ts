/**
 * External dependencies
 */
import { type BlockEditorStoreSelectors, store as blockEditorStore } from '@wordpress/block-editor';
import { dispatch, select, subscribe } from '@wordpress/data';
import { removeAwarenessStates as removeAwarenessStatesFromProtocol } from 'y-protocols/awareness';

/**
 * Internal dependencies
 */
import {
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
import {
	getSelectionState,
	SelectionType,
	updateSelectionInEntityRecord,
} from '@/utilities/selection';
import { getNewUserColor } from '@/utilities/user-color';

import type { EntityID, AwarenessStateChange } from '@wordpress/sync';
import type { Awareness } from 'y-protocols/awareness';

export class AwarenessManager {
	private static __instance: AwarenessManager;

	private constructor( private awareness: Awareness, private userInfo: WordPressUserInfo ) {
		this.setCurrentUserState();
		this.refreshAwareness();
		this.subscribeToSelectionChanges();
		this.subscribeToUserChanges();

		// Remove awareness states when the window is closed or refreshed.
		window.addEventListener( 'beforeunload', () => {
			removeAwarenessStatesFromProtocol(
				this.awareness,
				[ awareness.clientID ],
				'removeAwarenessStates'
			);
		} );
	}

	public static async initialize( awareness: Awareness, entityId: EntityID ): Promise< void > {
		if ( AwarenessManager.__instance ) {
			// eslint-disable-next-line no-console
			console.debug( `AwarenessManager was created more than once for entity ${ entityId }.` );
			return;
		}

		AwarenessManager.__instance = new AwarenessManager( awareness, await getCurrentUserInfo() );
	}

	public static setConnectionStatus( clientId: number, isConnected: boolean ): void {
		if ( clientId !== AwarenessManager.__instance?.awareness.clientID ) {
			return;
		}

		const { patchUser } = dispatch( awarenessStore );
		void patchUser( clientId, { isConnected } );
	}

	private setCurrentUserState(): void {
		const states = this.getStates();
		const otherUserColors = Array.from( states.values() )
			.filter( userState => ! userState.isMe )
			.map( userState => userState.color )
			.filter( Boolean );

		const currentUserState: UserState = {
			...this.userInfo,
			browserType: getBrowserName(),
			clientId: this.awareness.clientID,
			color: getNewUserColor( otherUserColors ),
			editorState: this.getLocalStateField( 'editorState' ) ?? {
				selection: {
					type: SelectionType.None,
				},
			},
			isConnected: true,
			isMe: true,
		};

		this.awareness.setLocalState( currentUserState );
	}

	/*
	 * Get the states from an awareness document.
	 */
	private getStates(): Map< number, UserState > {
		return this.awareness.getStates() as Map< number, UserState >;
	}

	/**
	 * Set a local state field on an awareness document.
	 */
	private getLocalStateField< FieldName extends keyof UserState >(
		field: FieldName
	): UserState[ FieldName ] | undefined {
		// eslint-disable-next-line security/detect-object-injection
		return ( this.awareness.getLocalState() as UserState )?.[ field ];
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

			userState.isMe = userState.clientId === this.awareness.clientID;

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

	private subscribeToSelectionChanges(): void {
		const { getSelectedBlocksInitialCaretPosition, getSelectionStart, getSelectionEnd } = select(
			blockEditorStore
		) as BlockEditorStoreSelectors;
		const { patchUser } = dispatch( awarenessStore );

		// Keep track of the current selection in the outer scope so we can compare
		// in the subscription.
		let selectionStart = getSelectionStart();
		let selectionEnd = getSelectionEnd();

		// Use timeouts to debounce state changes, local and remote.
		let awarenessCursorTimeout: NodeJS.Timeout;
		let localCursorTimeout: NodeJS.Timeout;

		subscribe( () => {
			const newSelectionStart = getSelectionStart();
			const newSelectionEnd = getSelectionEnd();

			if ( newSelectionStart === selectionStart && newSelectionEnd === selectionEnd ) {
				return;
			}

			selectionStart = newSelectionStart;
			selectionEnd = newSelectionEnd;

			const editorState = {
				selection: getSelectionState( selectionStart, selectionEnd ),
			};

			clearTimeout( awarenessCursorTimeout );
			clearTimeout( localCursorTimeout );

			localCursorTimeout = setTimeout( () => {
				void updateSelectionInEntityRecord(
					selectionStart,
					selectionEnd,
					getSelectedBlocksInitialCaretPosition()
				);
				void patchUser( this.awareness.clientID, { editorState } );
			}, LOCAL_CURSOR_UPDATE_DEBOUNCE_IN_MS );

			awarenessCursorTimeout = setTimeout( () => {
				this.setLocalStateField( 'editorState', editorState );
			}, AWARENESS_CURSOR_UPDATE_DEBOUNCE_IN_MS );
		} );
	}

	private subscribeToUserChanges(): void {
		const userRemovalTimeouts = new Map< number, NodeJS.Timeout >();
		const { patchUser, removeUser, upsertUser } = dispatch( awarenessStore );

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

				// If this is the current user, ignore. We handle our own state updates.
				if ( userState.clientId === this.awareness.clientID ) {
					return;
				}

				userState.isConnected = true;
				userState.isMe = false;

				void upsertUser( id, userState );
			} );

			removed.forEach( id => {
				// When a user is removed, we don't want to immediately remove their
				// state. Instead, we set a timeout to remove it after a short delay.
				if ( userRemovalTimeouts.has( id ) ) {
					return;
				}

				void patchUser( id, {
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
		if ( ! userState?.clientId || ! userState?.id || ! userState?.editorState ) {
			return false;
		}

		return true;
	}
}
