import { register, createReduxStore, StoreDescriptor } from '@wordpress/data';

import { loadFromLocalStorage, saveToLocalStorage } from '../utilities/local-storage';

const STORE_NAME = 'vip-realtime-collaboration/settings';
const LOCAL_STORAGE_KEY = 'vip-rtc-settings';

interface SettingsState {
	isAwarenessOverlayEnabled: boolean;
}

const DEFAULT_STATE: SettingsState = {
	isAwarenessOverlayEnabled: true,
};

const actions = {
	setAwarenessOverlayEnabled: ( enabled: boolean ): SettingsAction => ( {
		type: 'SET_AWARENESS_OVERLAY_ENABLED',
		payload: enabled,
	} ),
};

const reducer = (
	state = loadFromLocalStorage( LOCAL_STORAGE_KEY, DEFAULT_STATE ),
	action: SettingsAction
): SettingsState => {
	switch ( action.type ) {
		case 'SET_AWARENESS_OVERLAY_ENABLED': {
			const newState = {
				...state,
				isAwarenessOverlayEnabled: action.payload,
			};

			saveToLocalStorage( LOCAL_STORAGE_KEY, newState );
			return newState;
		}
		default:
			return state;
	}
};

const selectors = {
	isAwarenessOverlayEnabled( state: SettingsState ) {
		const { isAwarenessOverlayEnabled } = state;
		return isAwarenessOverlayEnabled;
	},
};

type SettingsAction = {
	type: 'SET_AWARENESS_OVERLAY_ENABLED';
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
	setAwarenessOverlayEnabled: ( enabled: boolean ) => void;
};

export type SettingsStoreSelectors = {
	isAwarenessOverlayEnabled: () => boolean;
};
