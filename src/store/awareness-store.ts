import { User } from '@wordpress/core-data';
import { register, createReduxStore, StoreDescriptor } from '@wordpress/data';

const STORE_NAME = 'vip-realtime-collaboration/awareness';

export interface UserState extends User {
	color: string;
	editorState: EditorState;
}

export interface EditorState {
	selectedBlockId?: string;
	selection?: {
		attributeKey: string;
		startOffset: number;
		endOffset: number;
	};
}

interface AwarenessStore {
	users: Map< number, UserState >;
}

const DEFAULT_STATE: AwarenessStore = {
	users: new Map(),
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
			return {
				...state,
				users: state.users.set( action.payload.stateId, action.payload.userState ),
			};
		}
		case 'REMOVE_STATE_ID': {
			const newUsers = new Map( state.users );
			newUsers.delete( action.payload.stateId );

			return {
				users: newUsers,
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
	): UserState[] {
		const { includeDuplicateUsers = false } = options;

		const users = Array.from( state.users.values() );

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
	getActiveUsers: ( options?: { includeDuplicateUsers?: boolean } ) => UserState[];
};
