import { addFilter } from '@wordpress/hooks';
import { registerPlugin } from '@wordpress/plugins';

import { setupViewOnlyBlocks } from './components/view-only-block';
import { ReadOnlyCodeEditor } from '@/components/read-only-code-editor';
import { RTCSettingsPanel } from '@/components/rtc-settings-panel';
import { WEBSOCKET_URL, ENABLE_ELECTED_MODES } from '@/utilities/config';
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

setupViewOnlyBlocks();

registerPlugin( 'vip-rtc-settings-panel', {
	render: RTCSettingsPanel,
} );

if ( ! ENABLE_ELECTED_MODES ) {
	registerPlugin( 'vip-rtc-read-only-code-editor', {
		render: ReadOnlyCodeEditor,
	} );
}
