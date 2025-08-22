/**
 * External dependencies
 */
import { dispatch, select, subscribe } from '@wordpress/data';
import { removeAwarenessStates as removeAwarenessStatesFromProtocol } from 'y-protocols/awareness';

/**
 * Internal dependencies
 */
import { SelectionType } from '@/hooks/use-render-cursors';
import {
	type UserState,
	type WordPressUserInfo,
	store as awarenessStore,
} from '@/store/awareness-store';
import { getBrowserName } from '@/utilities/browser';
import { REMOVAL_DELAY_IN_MS } from '@/utilities/config';
import { getCurrentUserInfo } from '@/utilities/entity';
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
		window.addEventListener( 'visibilitychange', () => {
			switch ( document.visibilityState ) {
				case 'hidden':
					this.awarenessInstances.forEach( awareness => {
						removeAwarenessStatesFromProtocol(
							awareness,
							[ awareness.clientID ],
							'removeAwarenessStates'
						);
					} );
					break;

				case 'visible':
					void AwarenessManager.refreshAwareness();
					break;
			}
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

		// Set local state.
		const userInfo = await manager.currentWordPressUserInfoPromise;
		const currentUserState = manager.getCurrentUserState( awareness, userInfo );
		awareness.setLocalState( currentUserState );

		// Subscribe to changes in the awareness instance and our store.
		manager.subscribeToUserChanges( awareness );
		manager.subscribeToSelectionChanges( awareness );
	}

	private getCurrentUserState( awareness: Awareness, userInfo: WordPressUserInfo ): UserState {
		const states = ( awareness.getStates() as Map< number, UserState > ) ?? new Map();
		const otherUserColors = Array.from( states.values() )
			.filter( userState => ! userState.isMe )
			.map( userState => userState.color )
			.filter( Boolean );

		const color = getNewUserColor( otherUserColors );

		return {
			...userInfo,
			browserType: getBrowserName(),
			clientId: awareness.clientID,
			color,
			editorState: {
				selection: {
					type: SelectionType.None,
				},
			},
			isConnected: true,
			isMe: true,
		};
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
		return ( awareness.getLocalState() as UserState )[ field ];
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

	public static async refreshAwareness(): Promise< void > {
		const manager = AwarenessManager.instance;
		const { removeUser, upsertUser } = dispatch( awarenessStore );
		const { getActiveClientIds } = select( awarenessStore );

		const clientIdsFromStore = new Set< number >( getActiveClientIds() );
		const clientIdsFromAwareness = new Set< number >();
		console.log( { clientIdsFromStore, clientIdsFromAwareness } );

		// Set local state.
		const userInfo = await manager.currentWordPressUserInfoPromise;

		manager.awarenessInstances.forEach( awareness => {
			const currentUserState = manager.getCurrentUserState( awareness, userInfo );
			awareness.setLocalState( currentUserState );

			manager.getStates( awareness ).forEach( ( userState, clientId ) => {
				void upsertUser( clientId, userState );
				clientIdsFromAwareness.add( clientId );
			} );
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
					selection: currentSelection,
				} );
			}
		} );
	}

	private subscribeToUserChanges( awareness: Awareness ): void {
		const userRemovalTimeouts = new Map< number, NodeJS.Timeout >();
		const { patchUser, removeUser, upsertUser } = dispatch( awarenessStore );

		const userStates = this.getStates( awareness );
		userStates.forEach( ( userState, clientId ) => {
			void upsertUser( clientId, userState );
		} );

		// NOTE: Our awareness store is currently global and has no ability to scope
		// to specific entities.

		awareness.on( 'change', ( { added, removed, updated }: AwarenessStateChange ) => {
			const updatedUserStates = this.getStates( awareness );

			[ ...added, ...updated ].forEach( id => {
				const userState = updatedUserStates.get( id );

				if ( userRemovalTimeouts.has( id ) ) {
					clearTimeout( userRemovalTimeouts.get( id ) );
				}

				if ( userState ) {
					void upsertUser( id, {
						...userState,
						isConnected: true,
						isMe:
							userState.clientId === this.getLocalStateField< 'clientId' >( awareness, 'clientId' ),
					} );
				}
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
					setTimeout( () => void removeUser( id ), REMOVAL_DELAY_IN_MS )
				);
			} );
		} );
	}
}
