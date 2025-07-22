import { User } from '@wordpress/core-data';
import { register, createReduxStore, StoreDescriptor } from '@wordpress/data';

import { type SelectionState } from '@/hooks/use-render-cursors';

const STORE_NAME = 'vip-realtime-collaboration/awareness';

export interface UserState extends User {
	color: string;
	editorState: EditorState;
}

export interface EditorState {
	selection: SelectionState;
}

interface AwarenessStore {
	userMap: Map< number, UserState >;
	userStates: UserState[];
}

const DEFAULT_STATE: AwarenessStore = {
	userMap: new Map(),
	userStates: [],
};

const actions = {
	updateUser: ( stateId: number, userState: UserState ): AwarenessAction => ( {
		type: 'UPDATE_USER',
		payload: { stateId, userState },
	} ),

	// State removal, call when a user leaves the editor
	removeStateId: ( stateId: number ): AwarenessAction => ( {
		type: 'REMOVE_STATE_ID',
		payload: { stateId },
	} ),
};

const reducer = ( state = DEFAULT_STATE, action: AwarenessAction ): AwarenessStore => {
	switch ( action.type ) {
		case 'UPDATE_USER': {
			const newUsers = new Map( state.userMap );
			newUsers.set( action.payload.stateId, action.payload.userState );

			const newUserStates = Array.from( newUsers.values() );

			return {
				...state,
				userMap: newUsers,
				userStates: newUserStates,
			};
		}
		case 'REMOVE_STATE_ID': {
			const newUsers = new Map( state.userMap );
			newUsers.delete( action.payload.stateId );

			const newUserStates = Array.from( newUsers.values() );

			return {
				userMap: newUsers,
				userStates: newUserStates,
			};
		}
		default:
			return state;
	}
};

const selectors = {
	getActiveUsers( state: AwarenessStore ): UserState[] {
		return state.userStates;
	},
};

type UpdateUserAction = {
	type: 'UPDATE_USER';
	payload: { stateId: number; userState: UserState };
};
type RemoveStateIdAction = {
	type: 'REMOVE_STATE_ID';
	payload: { stateId: number };
};

type AwarenessAction = UpdateUserAction | RemoveStateIdAction;

export const store = createReduxStore( STORE_NAME, {
	reducer,
	actions,
	selectors,
} );

( register as ( store: StoreDescriptor ) => void )( store );

export type { AwarenessStore };

export type AwarenessStoreActions = {
	updateUser: ( stateId: number, userState: UserState ) => void;
	removeStateId: ( stateId: number ) => void;
};

export type AwarenessStoreSelectors = {
	getActiveUsers: () => UserState[];
};
