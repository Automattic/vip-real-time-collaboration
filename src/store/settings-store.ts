import { register, createReduxStore, StoreDescriptor } from '@wordpress/data';

import { isDevelopment } from '@/utilities/config';
import { loadFromLocalStorage, saveToLocalStorage } from '@/utilities/local-storage';

const STORE_NAME = 'vip-real-time-collaboration/settings';
const LOCAL_STORAGE_KEY = 'vip-rtc-settings';

interface SettingsState {
	isAwarenessAvatarsEnabled: boolean;
	isAwarenessCursorsEnabled: boolean;
	isDebugToolsEnabled: boolean;
	isSelfAwarenessEnabled: boolean;
	isNotificationsForCollaboratorJoiningEnabled: boolean;
	isNotificationsForCollaboratorLeavingEnabled: boolean;
}

const DEFAULT_STATE: SettingsState = {
	isAwarenessAvatarsEnabled: true,
	isAwarenessCursorsEnabled: true,
	isDebugToolsEnabled: false,
	isSelfAwarenessEnabled: false,
	isNotificationsForCollaboratorJoiningEnabled: true,
	isNotificationsForCollaboratorLeavingEnabled: false,
};

const actions = {
	setAwarenessAvatarsEnabled: ( enabled: boolean ): SettingsAction => ( {
		type: 'SET_AWARENESS_AVATARS_ENABLED',
		payload: enabled,
	} ),
	setAwarenessCursorsEnabled: ( enabled: boolean ): SettingsAction => ( {
		type: 'SET_AWARENESS_CURSORS_ENABLED',
		payload: enabled,
	} ),
	setDebugToolsEnabled: ( enabled: boolean ): SettingsAction => ( {
		type: 'SET_DEBUG_TOOLS_ENABLED',
		payload: enabled,
	} ),
	setSelfAwarenessEnabled: ( enabled: boolean ): SettingsAction => ( {
		type: 'SET_SELF_AWARENESS_ENABLED',
		payload: enabled,
	} ),
	setNotificationsForCollaboratorJoiningEnabled: ( enabled: boolean ): SettingsAction => ( {
		type: 'SET_NOTIFICATIONS_FOR_COLLABORATOR_JOINING_ENABLED',
		payload: enabled,
	} ),
	setNotificationsForCollaboratorLeavingEnabled: ( enabled: boolean ): SettingsAction => ( {
		type: 'SET_NOTIFICATIONS_FOR_COLLABORATOR_LEAVING_ENABLED',
		payload: enabled,
	} ),
};

const reducer = (
	state = loadFromLocalStorage( LOCAL_STORAGE_KEY, DEFAULT_STATE ),
	action: SettingsAction
): SettingsState => {
	switch ( action.type ) {
		case 'SET_AWARENESS_AVATARS_ENABLED': {
			const newState = {
				...state,
				isAwarenessAvatarsEnabled: action.payload,
			};

			saveToLocalStorage( LOCAL_STORAGE_KEY, newState );
			return newState;
		}
		case 'SET_AWARENESS_CURSORS_ENABLED': {
			const newState = {
				...state,
				isAwarenessCursorsEnabled: action.payload,
			};

			saveToLocalStorage( LOCAL_STORAGE_KEY, newState );
			return newState;
		}
		case 'SET_DEBUG_TOOLS_ENABLED': {
			const newState = {
				...state,
				isDebugToolsEnabled: action.payload,
			};

			saveToLocalStorage( LOCAL_STORAGE_KEY, newState );
			return newState;
		}
		case 'SET_SELF_AWARENESS_ENABLED': {
			const newState = {
				...state,
				isSelfAwarenessEnabled: action.payload,
			};

			saveToLocalStorage( LOCAL_STORAGE_KEY, newState );
			return newState;
		}
		case 'SET_NOTIFICATIONS_FOR_COLLABORATOR_JOINING_ENABLED': {
			const newState = {
				...state,
				isNotificationsForCollaboratorJoiningEnabled: action.payload,
			};

			saveToLocalStorage( LOCAL_STORAGE_KEY, newState );
			return newState;
		}
		case 'SET_NOTIFICATIONS_FOR_COLLABORATOR_LEAVING_ENABLED': {
			const newState = {
				...state,
				isNotificationsForCollaboratorLeavingEnabled: action.payload,
			};

			saveToLocalStorage( LOCAL_STORAGE_KEY, newState );
			return newState;
		}
		default:
			return state;
	}
};

const selectors = {
	isAwarenessAvatarsEnabled( state: SettingsState ) {
		const { isAwarenessAvatarsEnabled } = state;
		return isAwarenessAvatarsEnabled;
	},
	isAwarenessCursorsEnabled( state: SettingsState ) {
		const { isAwarenessCursorsEnabled } = state;
		return isAwarenessCursorsEnabled;
	},
	isDebugToolsEnabled( state: SettingsState ) {
		return isDevelopment() ? state.isDebugToolsEnabled : false;
	},
	isSelfAwarenessEnabled( state: SettingsState ) {
		const { isSelfAwarenessEnabled } = state;
		return isSelfAwarenessEnabled;
	},
	isNotificationsForCollaboratorJoiningEnabled( state: SettingsState ) {
		return state.isNotificationsForCollaboratorJoiningEnabled;
	},
	isNotificationsForCollaboratorLeavingEnabled( state: SettingsState ) {
		return state.isNotificationsForCollaboratorLeavingEnabled;
	},
};

type SettingsAction = {
	type:
		| 'SET_AWARENESS_AVATARS_ENABLED'
		| 'SET_AWARENESS_CURSORS_ENABLED'
		| 'SET_DEBUG_TOOLS_ENABLED'
		| 'SET_SELF_AWARENESS_ENABLED'
		| 'SET_NOTIFICATIONS_FOR_COLLABORATOR_JOINING_ENABLED'
		| 'SET_NOTIFICATIONS_FOR_COLLABORATOR_LEAVING_ENABLED';
	payload: boolean;
};

export const store = createReduxStore( STORE_NAME, {
	reducer,
	actions,
	selectors,
} );

( register as ( store: StoreDescriptor ) => void )( store );

export type { SettingsState };

export type SettingsStoreActions = {
	setAwarenessAvatarsEnabled: ( enabled: boolean ) => void;
	setAwarenessCursorsEnabled: ( enabled: boolean ) => void;
	setDebugToolsEnabled: ( enabled: boolean ) => void;
	setSelfAwarenessEnabled: ( enabled: boolean ) => void;
	setNotificationsForCollaboratorJoiningEnabled: ( enabled: boolean ) => void;
	setNotificationsForCollaboratorLeavingEnabled: ( enabled: boolean ) => void;
};

export type SettingsStoreSelectors = {
	isAwarenessAvatarsEnabled: () => boolean;
	isAwarenessCursorsEnabled: () => boolean;
	isDebugToolsEnabled: () => boolean;
	isSelfAwarenessEnabled: () => boolean;
	isNotificationsForCollaboratorJoiningEnabled: () => boolean;
	isNotificationsForCollaboratorLeavingEnabled: () => boolean;
};
