import { addFilter } from '@wordpress/hooks';
import { registerPlugin } from '@wordpress/plugins';

import { RTCSettingsPanel } from './components/rtc-settings-panel';
import { SyncProviderWithAwareness } from './provider';
import { getWebSocketConnectionConfig } from './websocket-client';

import type { SyncProvider } from '@wordpress/sync';

addFilter( 'core.getSyncProvider', 'vip-rtc', ( provider: SyncProvider | null ) => {
	if ( provider ) {
		// If a provider already exists, return it.
		return provider;
	}

	const webSocketConnectionConfig = getWebSocketConnectionConfig();

	// We already error check for the WebSocket URL in the main plugin file,
	// so this is here for safety.
	if ( ! webSocketConnectionConfig.serverUrl ) {
		console.error(
			'VIP Real-Time Collaboration WebSocket URL has not been configured. The plugin will not be functional without it.'
		);
		return null;
	}

	return new SyncProviderWithAwareness( webSocketConnectionConfig );
} );

registerPlugin( 'vip-real-time-collaboration', {
	render: RTCSettingsPanel,
} );
