import { register, createReduxStore, StoreDescriptor } from '@wordpress/data';

import { isDevelopment } from '@/utilities/config';
import { loadFromLocalStorage, saveToLocalStorage } from '@/utilities/local-storage';

const STORE_NAME = 'vip-real-time-collaboration/settings';
const LOCAL_STORAGE_KEY = 'vip-rtc-settings';

export enum Setting {
	AWARENESS_AVATARS = 'Awareness_Avatars',
	AWARENESS_CURSORS = 'Awareness_Cursors',
	DEBUG_TOOLS = 'Debug_Tools',
	SELF_AWARENESS = 'Self_Awareness',
	POST_UPDATE_NOTIFICATION = 'Post_Update_Notification',
	USER_ENTER_NOTIFICATION = 'User_Enter_Notification',
	USER_EXIT_NOTIFICATION = 'User_Exit_Notification',
	VIEW_ONLY_MODE = 'View_Only_Mode',
}

interface SettingsState {
	[ Setting.AWARENESS_AVATARS ]: boolean;
	[ Setting.AWARENESS_CURSORS ]: boolean;
	[ Setting.DEBUG_TOOLS ]: boolean;
	[ Setting.SELF_AWARENESS ]: boolean;
	[ Setting.POST_UPDATE_NOTIFICATION ]: boolean;
	[ Setting.USER_ENTER_NOTIFICATION ]: boolean;
	[ Setting.USER_EXIT_NOTIFICATION ]: boolean;
	[ Setting.VIEW_ONLY_MODE ]: boolean;
}

const DEFAULT_STATE: SettingsState = {
	[ Setting.AWARENESS_AVATARS ]: true,
	[ Setting.AWARENESS_CURSORS ]: true,
	[ Setting.DEBUG_TOOLS ]: false,
	[ Setting.SELF_AWARENESS ]: false,
	[ Setting.POST_UPDATE_NOTIFICATION ]: true,
	[ Setting.USER_ENTER_NOTIFICATION ]: true,
	[ Setting.USER_EXIT_NOTIFICATION ]: false,
	[ Setting.VIEW_ONLY_MODE ]: false,
};

const actions = {
	setSetting: ( setting: Setting, enabled: boolean ): SettingsAction => ( {
		type: 'SET_SETTING',
		payload: { setting, enabled },
	} ),
};

const reducer = (
	state = loadFromLocalStorage( LOCAL_STORAGE_KEY, DEFAULT_STATE ),
	action: SettingsAction
): SettingsState => {
	switch ( action.type ) {
		case 'SET_SETTING': {
			const newState = {
				...state,
				[ action.payload.setting ]: action.payload.enabled,
			};

			saveToLocalStorage( LOCAL_STORAGE_KEY, newState );
			return newState;
		}
		default:
			return state;
	}
};

const selectors = {
	getSetting( state: SettingsState, setting: Setting ): boolean {
		// Special handling for debug tools - only available in development
		if ( setting === Setting.DEBUG_TOOLS ) {
			return isDevelopment() ? state[ setting ] : false;
		}
		if ( setting === Setting.VIEW_ONLY_MODE ) {
			return isDevelopment() ? state[ setting ] : false;
		}
		return state[ setting ];
	},
};

type SettingsAction = {
	type: 'SET_SETTING';
	payload: {
		setting: Setting;
		enabled: boolean;
	};
};

export const store = createReduxStore( STORE_NAME, {
	reducer,
	actions,
	selectors,
} );

( register as ( store: StoreDescriptor ) => void )( store );

export type { SettingsState };

export type SettingsStoreActions = {
	setSetting: ( setting: Setting, enabled: boolean ) => void;
};

export type SettingsStoreSelectors = {
	getSetting: ( setting: Setting ) => boolean;
};
