import { register, createReduxStore, StoreDescriptor } from '@wordpress/data';

import { isDevelopment } from '@/utilities/config';
import { loadFromLocalStorage, saveToLocalStorage } from '@/utilities/local-storage';

const STORE_NAME = 'vip-real-time-collaboration/settings';
const LOCAL_STORAGE_KEY = 'vip-rtc-settings';

export enum Setting {
	DEBUG_TOOLS = 'Debug_Tools',
}

interface SettingsState {
	[ Setting.DEBUG_TOOLS ]: boolean;
}

const DEFAULT_STATE: SettingsState = {
	[ Setting.DEBUG_TOOLS ]: false,
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
