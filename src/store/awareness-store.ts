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
}

export interface EditorState {
	selection: SelectionState;
}

export interface AwarenessStore {
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

			state.userMap.set( action.payload.clientId, updatedState );

			return {
				...state,
				userMap: new Map( state.userMap ),
			};
		}

		case 'REMOVE_USER': {
			const existingState = state.userMap.get( action.payload.clientId );

			if ( existingState?.userInfo ) {
				sendNotification( NotificationType.UserExited, existingState.userInfo );
			}

			state.userMap.delete( action.payload.clientId );

			return {
				...state,
				userMap: new Map( state.userMap ),
			};
		}

		case 'UPDATE_EDITOR_STATE': {
			if ( ! state.userMap.has( action.payload.clientId ) ) {
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
				sendNotification( NotificationType.UserEntered, userInfo );
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
