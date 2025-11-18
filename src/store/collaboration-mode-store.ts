import { register, createReduxStore, StoreDescriptor } from '@wordpress/data';

import { CollaborationMode } from '@/types/collaboration-mode';

const STORE_NAME = 'vip-real-time-collaboration/collaboration-mode';

interface CollaborationModeState {
	currentMode: CollaborationMode;
}

const DEFAULT_STATE: CollaborationModeState = {
	currentMode: CollaborationMode.EDIT,
};

const actions = {
	setMode: ( mode: CollaborationMode ): CollaborationModeAction => ( {
		type: 'SET_MODE',
		payload: { mode },
	} ),
};

const reducer = (
	state = DEFAULT_STATE,
	action: CollaborationModeAction
): CollaborationModeState => {
	switch ( action.type ) {
		case 'SET_MODE': {
			return {
				...state,
				currentMode: action.payload.mode,
			};
		}
		default:
			return state;
	}
};

const selectors = {
	getMode( state: CollaborationModeState ): CollaborationMode {
		return state.currentMode;
	},
};

type CollaborationModeAction = {
	type: 'SET_MODE';
	payload: {
		mode: CollaborationMode;
	};
};

export const store = createReduxStore( STORE_NAME, {
	reducer,
	actions,
	selectors,
} );

( register as ( store: StoreDescriptor ) => void )( store );

export type { CollaborationModeState };

export type CollaborationModeStoreActions = {
	setMode: ( mode: CollaborationMode ) => void;
};

export type CollaborationModeStoreSelectors = {
	getMode: () => CollaborationMode;
};
