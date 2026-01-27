import { addFilter } from '@wordpress/hooks';
import { registerPlugin } from '@wordpress/plugins';

import { RTCSettingsPanel } from '@/components/rtc-settings-panel';
import { getMetaSyncManager, createYoastSeoBridge } from '@/meta-sync';
import { WEBSOCKET_URL } from '@/utilities/config';
import { Logger } from '@/utilities/logger';
import { createWebSocketConnection } from '@/websocket-client';

// Register meta sync bridges for third-party plugins
const metaSyncManager = getMetaSyncManager();
metaSyncManager.registerBridge( createYoastSeoBridge() );

addFilter( 'sync.providers', 'vip-rtc', () => {
	// We already error check for the WebSocket URL in the main plugin file,
	// so this is here for safety.
	if ( ! WEBSOCKET_URL ) {
		new Logger().critical(
			'VIP Real-Time Collaboration WebSocket URL has not been configured. The plugin will not be functional without it.'
		);
		return [];
	}

	return [ createWebSocketConnection( WEBSOCKET_URL ) ];
} );

registerPlugin( 'vip-rtc-settings-panel', {
	render: RTCSettingsPanel,
} );
