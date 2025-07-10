import { User } from '@wordpress/core-data';
import { register, createReduxStore, StoreDescriptor } from '@wordpress/data';

const STORE_NAME = 'vip-realtime-collaboration/awareness';

interface AwarenessStore {
	activeUsers: Map< number, User >;
}

const DEFAULT_STATE: AwarenessStore = {
	activeUsers: new Map(),
};

const actions = {
	updateUser: ( stateId: number, user: User ): AwarenessAction => ( {
		type: 'UPDATE_USER',
		payload: { stateId, user },
	} ),
	removeUser: ( stateId: number ): AwarenessAction => ( {
		type: 'REMOVE_USER',
		payload: { stateId },
	} ),
};

const reducer = ( state = DEFAULT_STATE, action: AwarenessAction ): AwarenessStore => {
	switch ( action.type ) {
		case 'UPDATE_USER': {
			return {
				activeUsers: state.activeUsers.set( action.payload.stateId, action.payload.user ),
			};
		}
		case 'REMOVE_USER': {
			const newActiveUsers = new Map( state.activeUsers );
			newActiveUsers.delete( action.payload.stateId );

			return {
				activeUsers: newActiveUsers,
			};
		}
		default:
			return state;
	}
};

const selectors = {
	getActiveUsers(
		state: AwarenessStore,
		options: { includeDuplicateUsers?: boolean } = {}
	): User[] {
		const { includeDuplicateUsers = false } = options;

		const users = Array.from( state.activeUsers.values() );

		if ( includeDuplicateUsers ) {
			return users;
		}

		const uniqueUserIds: Record< number, boolean > = {};

		return users.filter( function ( user ) {
			return uniqueUserIds[ user.id ] ? false : ( uniqueUserIds[ user.id ] = true );
		} );
	},
};

type UpdateUserAction = {
	type: 'UPDATE_USER';
	payload: { stateId: number; user: User };
};

type RemoveUserAction = {
	type: 'REMOVE_USER';
	payload: { stateId: number };
};

type AwarenessAction = UpdateUserAction | RemoveUserAction;

export const store = createReduxStore( STORE_NAME, {
	reducer,
	actions,
	selectors,
} );

( register as ( store: StoreDescriptor ) => void )( store );

export type { AwarenessStore };
