import { User } from '@wordpress/core-data';
import { register, createReduxStore, StoreDescriptor } from '@wordpress/data';

import { type SelectionState } from '@/hooks/use-render-cursors';

const STORE_NAME = 'vip-real-time-collaboration/awareness';

export interface UserState extends Pick< User, 'avatar_urls' | 'id' | 'name' > {
	color: string;
	editorState: EditorState;
	isConnected: boolean;
	isMe: boolean;
}

interface EditorState {
	selection: SelectionState;
}

export interface AwarenessStore {
	userMap: Map< number, UserState >;
}

interface PatchUserAction {
	type: 'PATCH_USER';
	payload: { stateId: number; userState: Partial< UserState > };
}

interface RemoveUserAction {
	type: 'REMOVE_USER';
	payload: { stateId: number };
}

interface UpsertUserAction {
	type: 'UPSERT_USER';
	payload: { stateId: number; userState: UserState };
}

type AwarenessAction = PatchUserAction | RemoveUserAction | UpsertUserAction;

const DEFAULT_STATE: AwarenessStore = {
	userMap: new Map(),
};

const actions = {
	patchUser: ( stateId: number, userState: Partial< UserState > ): AwarenessAction => ( {
		type: 'PATCH_USER',
		payload: { stateId, userState },
	} ),

	// Call when a user leaves the editor (after a delay)
	removeUser: ( stateId: number ): AwarenessAction => ( {
		type: 'REMOVE_USER',
		payload: { stateId },
	} ),

	upsertUser: ( stateId: number, userState: UserState ): AwarenessAction => ( {
		type: 'UPSERT_USER',
		payload: { stateId, userState },
	} ),
};

const reducer = ( state = DEFAULT_STATE, action: AwarenessAction ): AwarenessStore => {
	switch ( action.type ) {
		case 'PATCH_USER': {
			if ( state.userMap.has( action.payload.stateId ) ) {
				state.userMap.set( action.payload.stateId, {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					...state.userMap.get( action.payload.stateId )!,
					...action.payload.userState,
				} );
			}

			return {
				...state,
				userMap: new Map( state.userMap ),
			};
		}

		case 'REMOVE_USER': {
			state.userMap.delete( action.payload.stateId );

			return {
				...state,
				userMap: new Map( state.userMap ),
			};
		}

		case 'UPSERT_USER': {
			state.userMap.set( action.payload.stateId, action.payload.userState );

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
	getActiveUsers( state: AwarenessStore ): UserState[] {
		return Array.from( state.userMap.values() );
	},
};

export const store = createReduxStore( STORE_NAME, {
	reducer,
	actions,
	selectors,
} );

( register as ( storeDescriptor: StoreDescriptor ) => void )( store );

export interface AwarenessStoreActions {
	addUser: ( stateId: number, userState: UserState ) => void;
	updateUser: ( stateId: number, userState: Partial< UserState > ) => void;
	removeUser: ( stateId: number ) => void;
}

export interface AwarenessStoreSelectors {
	getActiveUsers: () => UserState[];
}
