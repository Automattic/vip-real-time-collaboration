import { addFilter } from '@wordpress/hooks';
import { registerPlugin } from '@wordpress/plugins';

import { disableBlockEditingForViewMode } from './components/disable-block-editing-for-view-mode';
import { RTCSettingsPanel } from '@/components/rtc-settings-panel';
import { WEBSOCKET_URL } from '@/utilities/config';
import { Logger } from '@/utilities/logger';
import { createWebSocketConnection } from '@/websocket-client';

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

disableBlockEditingForViewMode();
