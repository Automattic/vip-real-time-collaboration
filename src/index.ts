import { addFilter } from '@wordpress/hooks';
import { registerPlugin } from '@wordpress/plugins';

import { RTCSettingsPanel } from '@/components/rtc-settings-panel';
import { SyncProviderWithAwareness } from '@/provider';
import { WEBSOCKET_URL } from '@/utilities/config';
import { Logger } from '@/utilities/logger';
import { getWebSocketConnectionConfig } from '@/websocket-client';

import type { ComponentType } from '@wordpress/element';
import type { SyncProvider } from '@wordpress/sync';

addFilter( 'core.getSyncProvider', 'vip-rtc', ( provider: SyncProvider | null ) => {
	if ( provider ) {
		// If a provider already exists, return it.
		return provider;
	}

	// We already error check for the WebSocket URL in the main plugin file,
	// so this is here for safety.
	if ( ! WEBSOCKET_URL ) {
		new Logger().critical(
			'VIP Real-Time Collaboration WebSocket URL has not been configured. The plugin will not be functional without it.'
		);
		return null;
	}

	const webSocketConnectionConfig = getWebSocketConnectionConfig( WEBSOCKET_URL );

	return new SyncProviderWithAwareness( webSocketConnectionConfig );
} );

function replacePostLockedModal(): ComponentType {
	// Returning a no-op component disables the default post locked modal.
	return () => null;
}

addFilter( 'editor.PostLockedModal', 'vip-rtc', replacePostLockedModal );

registerPlugin( 'vip-real-time-collaboration', {
	render: RTCSettingsPanel,
} );
