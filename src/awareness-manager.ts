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

	private static instance: AwarenessManager;

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

	public static async bootstrap( entityId: EntityID, awareness: Awareness ): Promise< void > {
		if ( ! AwarenessManager.instance ) {
			AwarenessManager.instance = new AwarenessManager();
		}

		const manager = AwarenessManager.instance;

		// Record the awareness instance.
		manager.awarenessInstances.set( entityId, awareness );

		// Subscribe to changes in the awareness instance and our store.
		await manager.subscribeToUserChanges( awareness );
		manager.subscribeToSelectionChanges( awareness );
	}

	private async getCurrentUserState( awareness: Awareness ): Promise< UserState > {
		const states = ( awareness.getStates() as Map< number, UserState > ) ?? new Map();
		const otherUserColors = Array.from( states.values() )
			.filter( userState => ! userState.isMe )
			.map( userState => userState.color )
			.filter( Boolean );

		const color = getNewUserColor( otherUserColors );
		const userInfo = await this.currentWordPressUserInfoPromise;

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
	private setLocalStateField< FieldName extends keyof UserState >(
		awareness: Awareness,
		field: FieldName,
		value: UserState[ FieldName ]
	): void {
		awareness.setLocalStateField( field, value );
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

	private async subscribeToUserChanges( awareness: Awareness ): Promise< void > {
		const currentUserState = await this.getCurrentUserState( awareness );

		awareness.setLocalState( currentUserState );

		const userRemovalTimeouts = new Map< number, NodeJS.Timeout >();
		const { patchUser, removeUser, upsertUser } = dispatch( awarenessStore );

		const userStates = this.getStates( awareness );
		userStates.forEach( ( userState, clientId ) => {
			void upsertUser( clientId, userState );
		} );

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
						isMe: userState.clientId === currentUserState.clientId,
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
