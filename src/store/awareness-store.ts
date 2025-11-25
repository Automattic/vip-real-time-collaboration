import { User } from '@wordpress/core-data';
import { register, createReduxStore, StoreDescriptor } from '@wordpress/data';

import { NotificationType, sendNotification } from '@/utilities/notifications';
import { type SelectionState } from '@/utilities/selection';
import { areEditorStatesEqual, areUserInfosEqual, areUserStatesEqual } from '@/utilities/user';

const STORE_NAME = 'vip-real-time-collaboration/awareness';

export type WordPressUserInfo = Pick< User, 'id' | 'name' | 'email' > & {
	avatarUrl?: string;
};

export interface UserState {
	editorState?: EditorState;
	userInfo: UserInfo;
}

export interface UserInfo extends WordPressUserInfo {
	clientId: number;
	browserType: string;
	color: string;
	isConnected: boolean;
	isMe: boolean;
	enteredAt: number;
}

export interface EditorState {
	selection: SelectionState;
}

export interface AwarenessStore {
	// The set of currently active user client IDs.
	currentUsers: Set< number >;
	// For all users seen in this session, a map of client ID to user state.
	userMap: Map< number, UserState >;
}

interface PatchUserInfoAction {
	type: 'PATCH_USER_INFO';
	payload: { clientId: number; userInfo: Partial< UserInfo > };
}

interface RemoveUserAction {
	type: 'REMOVE_USER';
	payload: { clientId: number };
}

interface UpdateEditorStateAction {
	type: 'UPDATE_EDITOR_STATE';
	payload: { clientId: number; editorState: EditorState };
}

interface UpsertUserAction {
	type: 'UPSERT_USER';
	payload: { clientId: number; userState: UserState };
}

type AwarenessAction =
	| PatchUserInfoAction
	| RemoveUserAction
	| UpdateEditorStateAction
	| UpsertUserAction;

const DEFAULT_STATE: AwarenessStore = {
	currentUsers: new Set< number >(),
	userMap: new Map< number, UserState >(),
};

const actions = {
	patchUserInfo: ( clientId: number, userInfo: Partial< UserInfo > ): AwarenessAction => ( {
		type: 'PATCH_USER_INFO',
		payload: { clientId, userInfo },
	} ),

	// Call when a user leaves the editor (after a delay)
	removeUser: ( clientId: number ): AwarenessAction => ( {
		type: 'REMOVE_USER',
		payload: { clientId },
	} ),

	updateEditorState: ( clientId: number, editorState: EditorState ): AwarenessAction => ( {
		type: 'UPDATE_EDITOR_STATE',
		payload: { clientId, editorState },
	} ),

	upsertUser: ( clientId: number, userState: UserState ): AwarenessAction => ( {
		type: 'UPSERT_USER',
		payload: { clientId, userState },
	} ),
};

const reducer = ( state = DEFAULT_STATE, action: AwarenessAction ): AwarenessStore => {
	switch ( action.type ) {
		case 'PATCH_USER_INFO': {
			if ( ! state.userMap.has( action.payload.clientId ) ) {
				return state;
			}

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const existingState = state.userMap.get( action.payload.clientId )!;
			const updatedState = {
				...existingState,
				userInfo: {
					...existingState.userInfo,
					...action.payload.userInfo,
				},
			};

			if ( areUserInfosEqual( existingState.userInfo, updatedState.userInfo ) ) {
				// No changes, don't update the state.
				return state;
			}

			state.currentUsers.add( action.payload.clientId );
			state.userMap.set( action.payload.clientId, updatedState );

			return {
				currentUsers: new Set( state.currentUsers ),
				userMap: new Map( state.userMap ),
			};
		}

		case 'REMOVE_USER': {
			const existingState = state.userMap.get( action.payload.clientId );

			if ( existingState?.userInfo ) {
				sendNotification( NotificationType.UserExited, existingState.userInfo );
			}

			state.currentUsers.delete( action.payload.clientId );

			return {
				...state,
				currentUsers: new Set( state.currentUsers ),
			};
		}

		case 'UPDATE_EDITOR_STATE': {
			if ( ! state.currentUsers.has( action.payload.clientId ) ) {
				return state;
			}

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const existingState = state.userMap.get( action.payload.clientId )!;
			const updatedState = {
				...existingState,
				editorState: action.payload.editorState,
			};

			if ( areEditorStatesEqual( existingState.editorState, updatedState.editorState ) ) {
				// No changes, don't update the state.
				return state;
			}

			state.userMap.set( action.payload.clientId, updatedState );

			return {
				...state,
				userMap: new Map( state.userMap ),
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
			} else {
				const { userInfo } = action.payload.userState;
				const currentMeUser = Array.from( state.userMap.values() ).find(
					user => user.userInfo.isMe && user.userInfo.isConnected
				);

				sendNotification(
					NotificationType.UserEntered,
					userInfo,
					undefined,
					currentMeUser?.userInfo
				);
			}

			state.currentUsers.add( action.payload.clientId );
			state.userMap.set( action.payload.clientId, action.payload.userState );

			return {
				currentUsers: new Set( state.currentUsers ),
				userMap: new Map( state.userMap ),
			};
		}

		default:
			return state;
	}
};

const selectors = {
	getActiveClientIds( state: AwarenessStore ): number[] {
		return Array.from( state.currentUsers.values() );
	},
	getActiveUsers( state: AwarenessStore ): Map< number, UserState > {
		return new Map(
			Array.from( state.userMap.entries() ).filter( ( [ clientId ] ) =>
				state.currentUsers.has( clientId )
			)
		);
	},
	getSeenUsers( state: AwarenessStore ): Map< number, UserState > {
		return state.userMap;
	},
	isDisconnected( state: AwarenessStore ): boolean {
		return (
			Array.from( selectors.getActiveUsers( state ).values() ).findIndex(
				user => user.userInfo.isMe && false === user.userInfo.isConnected
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
	isDisconnected: () => boolean;
}
