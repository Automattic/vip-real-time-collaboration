import { User } from '@wordpress/core-data';
import { register, createReduxStore, StoreDescriptor } from '@wordpress/data';

import { areSelectionsEqual, SelectionType, type SelectionState } from '@/utilities/selection';
import { areUserStatesEqual } from '@/utilities/user';

const STORE_NAME = 'vip-real-time-collaboration/awareness';

export type WordPressUserInfo = Pick< User, 'id' | 'name' > & { avatarUrl?: string };

export interface UserState extends WordPressUserInfo {
	browserType: string;
	clientId: number;
	color: string;
	editorState: EditorState;
	isConnected: boolean;
	isMe: boolean;
}

export interface EditorState {
	selection: SelectionState;
}

export interface AwarenessStore {
	currentUserSelection: SelectionState;
	userMap: Map< number, UserState >;
}

interface PatchUserAction {
	type: 'PATCH_USER';
	payload: { clientId: number; userState: Partial< UserState > };
}

interface RemoveUserAction {
	type: 'REMOVE_USER';
	payload: { clientId: number };
}

interface SetCurrentUserSelectionAction {
	type: 'SET_CURRENT_USER_SELECTION';
	payload: { selection: SelectionState };
}

interface UpsertUserAction {
	type: 'UPSERT_USER';
	payload: { clientId: number; userState: UserState };
}

type AwarenessAction =
	| PatchUserAction
	| RemoveUserAction
	| SetCurrentUserSelectionAction
	| UpsertUserAction;

const DEFAULT_STATE: AwarenessStore = {
	currentUserSelection: {
		type: SelectionType.None,
	},
	userMap: new Map< number, UserState >(),
};

const actions = {
	patchUser: ( clientId: number, userState: Partial< UserState > ): AwarenessAction => ( {
		type: 'PATCH_USER',
		payload: { clientId, userState },
	} ),

	// Call when a user leaves the editor (after a delay)
	removeUser: ( clientId: number ): AwarenessAction => ( {
		type: 'REMOVE_USER',
		payload: { clientId },
	} ),

	setCurrentUserSelection: ( selection: SelectionState ): AwarenessAction => ( {
		type: 'SET_CURRENT_USER_SELECTION',
		payload: { selection },
	} ),

	upsertUser: ( clientId: number, userState: UserState ): AwarenessAction => ( {
		type: 'UPSERT_USER',
		payload: { clientId, userState },
	} ),
};

const reducer = ( state = DEFAULT_STATE, action: AwarenessAction ): AwarenessStore => {
	switch ( action.type ) {
		case 'PATCH_USER': {
			if ( state.userMap.has( action.payload.clientId ) ) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const existingState = state.userMap.get( action.payload.clientId )!;
				const updatedState = {
					...existingState,
					...action.payload.userState,
				};

				if ( ! areUserStatesEqual( existingState, updatedState ) ) {
					state.userMap.set( action.payload.clientId, updatedState );

					return {
						...state,
						userMap: new Map( state.userMap ),
					};
				}
			}

			// No changes, don't update the state.
			return state;
		}

		case 'REMOVE_USER': {
			state.userMap.delete( action.payload.clientId );

			return {
				...state,
				userMap: new Map( state.userMap ),
			};
		}

		case 'SET_CURRENT_USER_SELECTION': {
			if ( areSelectionsEqual( state.currentUserSelection, action.payload.selection ) ) {
				return state;
			}

			return {
				...state,
				currentUserSelection: action.payload.selection,
			};
		}

		case 'UPSERT_USER': {
			if ( state.userMap.has( action.payload.clientId ) ) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const existingState = state.userMap.get( action.payload.clientId )!;

				if ( areUserStatesEqual( existingState, action.payload.userState ) ) {
					// No changes, don't update the state.
					return state;
				}
			}

			state.userMap.set( action.payload.clientId, action.payload.userState );

			return {
				...state,
				userMap: new Map( state.userMap ),
			};
		}

		default:
			return state;
	}
};

const selectors = {
	getActiveClientIds( state: AwarenessStore ): number[] {
		return Array.from( state.userMap.keys() );
	},
	getActiveUsers( state: AwarenessStore ): Map< number, UserState > {
		return state.userMap;
	},
	getCurrentUserSelection( state: AwarenessStore ): SelectionState {
		return state.currentUserSelection;
	},
	isDisconnected( state: AwarenessStore ): boolean {
		return (
			Array.from( selectors.getActiveUsers( state ).values() ).findIndex(
				user => user.isMe && false === user.isConnected
			) !== -1
		);
	},
};

export const store = createReduxStore( STORE_NAME, {
	reducer,
	actions,
	selectors,
} );

( register as ( storeDescriptor: StoreDescriptor ) => void )( store );

export interface AwarenessStoreSelectors {
	getActiveClientIds: () => number[];
	getActiveUsers: () => Map< number, UserState >;
	getCurrentUserSelection: () => SelectionState;
	isDisconnected: () => boolean;
}
