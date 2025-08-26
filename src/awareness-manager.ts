/**
 * External dependencies
 */
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
import { REMOVAL_DELAY_IN_MS } from '@/utilities/config';
import { getCurrentUserInfo } from '@/utilities/entity';
import { SelectionType } from '@/utilities/selection';
import { getNewUserColor } from '@/utilities/user-color';

import type { EntityID, AwarenessStateChange } from '@wordpress/sync';
import type { Awareness } from 'y-protocols/awareness';

export class AwarenessManager {
	private awarenessInstances: Map< EntityID, Awareness > = new Map();
	private currentWordPressUserInfoPromise: Promise< WordPressUserInfo >;

	private static __instance: AwarenessManager;

	private constructor() {
		this.currentWordPressUserInfoPromise = getCurrentUserInfo();

		// Remove awareness states when the window is closed or refreshed.
		window.addEventListener( 'beforeunload', () => {
			this.awarenessInstances.forEach( awareness => {
				removeAwarenessStatesFromProtocol(
					awareness,
					[ awareness.clientID ],
					'removeAwarenessStates'
				);
			} );
		} );
	}

	private static get instance(): AwarenessManager {
		if ( ! AwarenessManager.__instance ) {
			AwarenessManager.__instance = new AwarenessManager();
		}

		return AwarenessManager.__instance;
	}

	public static async bootstrap( entityId: EntityID, awareness: Awareness ): Promise< void > {
		const manager = AwarenessManager.instance;

		// Record the awareness instance.
		manager.awarenessInstances.set( entityId, awareness );

		// Get WordPress user info.
		const userInfo = await manager.currentWordPressUserInfoPromise;

		// Refresh our store based on the current state of the awareness instance.
		manager.refreshAwareness( awareness, userInfo );

		// Subscribe to changes in the awareness instance and our store.
		manager.subscribeToUserChanges( awareness );
		manager.subscribeToSelectionChanges( awareness );
	}

	public static async initialize(): Promise< void > {
		const manager = AwarenessManager.instance;
		const userInfo = await manager.currentWordPressUserInfoPromise;

		manager.awarenessInstances.forEach( awareness => {
			manager.refreshAwareness( awareness, userInfo );
		} );
	}

	private setCurrentUserState( awareness: Awareness, userInfo: WordPressUserInfo ): UserState {
		const states = ( awareness.getStates() as Map< number, UserState > ) ?? new Map();
		const otherUserColors = Array.from( states.values() )
			.filter( userState => ! userState.isMe )
			.map( userState => userState.color )
			.filter( Boolean );

		const currentUserState: UserState = {
			...userInfo,
			browserType: getBrowserName(),
			clientId: awareness.clientID,
			color: getNewUserColor( otherUserColors ),
			editorState: {
				selection: {
					// We set this to none, but note that it is never used and never
					// updated. Instead we consume the selection from the editor store.
					type: SelectionType.None,
				},
			},
			isConnected: true,
			isMe: true,
		};

		awareness.setLocalState( currentUserState );

		return currentUserState;
	}

	/*
	 * Get the states from an awareness document.
	 */
	private getStates( awareness: Awareness ): Map< number, UserState > {
		return awareness.getStates() as Map< number, UserState >;
	}

	/**
	 * Set a local state field on an awareness document.
	 */
	private getLocalStateField< FieldName extends keyof UserState >(
		awareness: Awareness,
		field: FieldName
	): UserState[ FieldName ] | undefined {
		// eslint-disable-next-line security/detect-object-injection
		return ( awareness.getLocalState() as UserState )?.[ field ];
	}

	/**
	 * Set a local state field on an awareness document.
	 */
	private setLocalStateField< FieldName extends keyof UserState >(
		awareness: Awareness,
		field: FieldName,
		value: UserState[ FieldName ]
	): void {
		awareness.setLocalStateField( field, value );
	}

	private refreshAwareness( awareness: Awareness, userInfo: WordPressUserInfo ): void {
		const { removeUser, upsertUser } = dispatch( awarenessStore );
		const { getActiveClientIds } = select( awarenessStore );

		const clientIdsFromStore = new Set< number >( getActiveClientIds() );
		const clientIdsFromAwareness = new Set< number >();

		this.getStates( awareness ).forEach( ( userState, clientId ) => {
			// Set local state for this awareness instance.
			const currentUserState = this.setCurrentUserState( awareness, userInfo );

			// The initial state may contain invalid state, so we validate it and
			// skip logging since the origin of the state is not from us.
			if ( ! this.validateUserState( userState ) ) {
				return;
			}

			userState.isMe = userState.clientId === currentUserState.clientId;

			void upsertUser( clientId, userState );
			clientIdsFromAwareness.add( clientId );
		} );

		// Remove users that are in the store but not in the awareness instances.
		clientIdsFromStore.forEach( clientId => {
			if ( ! clientIdsFromAwareness.has( clientId ) ) {
				void removeUser( clientId );
			}
		} );
	}

	private subscribeToSelectionChanges( awareness: Awareness ): void {
		const { getCurrentUserSelection } = select( awarenessStore );

		let currentSelection = getCurrentUserSelection();
		subscribe( () => {
			const newSelection = getCurrentUserSelection();
			if ( newSelection !== currentSelection ) {
				currentSelection = newSelection;
				this.setLocalStateField( awareness, 'editorState', {
					selection: newSelection,
				} );
			}
		} );
	}

	private subscribeToUserChanges( awareness: Awareness ): void {
		const userRemovalTimeouts = new Map< number, NodeJS.Timeout >();
		const { patchUser, removeUser, upsertUser } = dispatch( awarenessStore );

		// NOTE: Our awareness store is currently global and has no ability to scope
		// to specific entities.

		awareness.on( 'change', ( { added, removed, updated }: AwarenessStateChange ) => {
			const updatedUserStates = this.getStates( awareness );
			const currentUserClientId = this.getLocalStateField< 'clientId' >( awareness, 'clientId' );

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
				if ( userState.clientId === currentUserClientId ) {
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
