import { User } from '@wordpress/core-data';
import { register, createReduxStore, StoreDescriptor } from '@wordpress/data';

const STORE_NAME = 'vip-realtime-collaboration/awareness';

interface AwarenessStore {
	activeUsers: User[];
}

const DEFAULT_STATE: AwarenessStore = {
	activeUsers: [],
};

const actions = {
	updateUser: ( user: User ): AwarenessAction => ( {
		type: 'UPDATE_USER',
		payload: user,
	} ),
	removeUser: ( user: User ): AwarenessAction => ( {
		type: 'REMOVE_USER',
		payload: user,
	} ),
};

const reducer = ( state = DEFAULT_STATE, action: AwarenessAction ): AwarenessStore => {
	switch ( action.type ) {
		case 'UPDATE_USER': {
			const userIndex = state.activeUsers.findIndex( user => user.id === action.payload.id );

			if ( userIndex === -1 ) {
				// User doesn't exist, add them
				return {
					activeUsers: state.activeUsers.concat( action.payload ),
				};
			}

			const newUsers = [ ...state.activeUsers ];
			newUsers.splice( userIndex, 1, action.payload );

			return {
				activeUsers: newUsers,
			};
		}
		case 'REMOVE_USER': {
			return {
				activeUsers: state.activeUsers.filter( user => user.id !== action.payload.id ),
			};
		}
		default:
			return state;
	}
};

const selectors = {
	getActiveUsers( state: AwarenessStore ): User[] {
		return state.activeUsers;
	},
};

type UpdateUserAction = {
	type: 'UPDATE_USER';
	payload: User;
};

type RemoveUserAction = {
	type: 'REMOVE_USER';
	payload: User;
};

type AwarenessAction = UpdateUserAction | RemoveUserAction;

export const store = createReduxStore( STORE_NAME, {
	reducer,
	actions,
	selectors,
} );

( register as ( store: StoreDescriptor ) => void )( store );

export type { AwarenessStore };
