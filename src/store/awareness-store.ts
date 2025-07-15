import { User } from '@wordpress/core-data';
import { register, createReduxStore, StoreDescriptor } from '@wordpress/data';

const STORE_NAME = 'vip-realtime-collaboration/awareness';

export interface UserState {
	user: User;
	editorState?: EditorState;
}

export interface EditorState {
	editorColor?: string;
	selectedBlockId?: string;
}

interface AwarenessStore {
	activeUsers: Map< number, User >;
	editorStates: Map< number, EditorState >;
}

const DEFAULT_STATE: AwarenessStore = {
	activeUsers: new Map(),
	editorStates: new Map(),
};

const actions = {
	// User updates
	updateUser: ( stateId: number, user: User ): AwarenessAction => ( {
		type: 'UPDATE_USER',
		payload: { stateId, user },
	} ),

	// Editor updates
	updateEditorState: ( stateId: number, editorState: EditorState ): AwarenessAction => ( {
		type: 'UPDATE_EDITOR_STATE',
		payload: { stateId, editorState },
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
				activeUsers: state.activeUsers.set( action.payload.stateId, action.payload.user ),
			};
		}
		case 'UPDATE_EDITOR_STATE': {
			return {
				...state,
				editorStates: state.editorStates.set( action.payload.stateId, action.payload.editorState ),
			};
		}
		case 'REMOVE_STATE_ID': {
			const newActiveUsers = new Map( state.activeUsers );
			newActiveUsers.delete( action.payload.stateId );

			const newEditorStates = new Map( state.editorStates );
			newEditorStates.delete( action.payload.stateId );

			return {
				activeUsers: newActiveUsers,
				editorStates: newEditorStates,
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
	getEditorStates( state: AwarenessStore ): EditorState[] {
		return Array.from( state.editorStates.values() );
	},
};

type UpdateUserAction = {
	type: 'UPDATE_USER';
	payload: { stateId: number; user: User };
};
type UpdateEditorStateAction = {
	type: 'UPDATE_EDITOR_STATE';
	payload: { stateId: number; editorState: EditorState };
};
type RemoveStateIdAction = {
	type: 'REMOVE_STATE_ID';
	payload: { stateId: number };
};

type AwarenessAction = UpdateUserAction | UpdateEditorStateAction | RemoveStateIdAction;

export const store = createReduxStore( STORE_NAME, {
	reducer,
	actions,
	selectors,
} );

( register as ( store: StoreDescriptor ) => void )( store );

export type { AwarenessStore };

export type AwarenessStoreActions = {
	updateUser: ( stateId: number, user: User ) => void;
	updateEditorState: ( stateId: number, editorState: EditorState ) => void;
	removeStateId: ( stateId: number ) => void;
};

export type AwarenessStoreSelectors = {
	getActiveUsers: ( options?: { includeDuplicateUsers?: boolean } ) => User[];
	getEditorStates: () => EditorState[];
};
