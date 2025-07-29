import { addFilter } from '@wordpress/hooks';

import { createSyncProvider } from './provider';
import { getWebSocketUrl } from './utils';
import { createWebSocketConnection } from './websocket-client';

import type { SyncProvider } from '@wordpress/sync';

addFilter( 'core.getSyncProvider', 'vip-rtc', ( provider: SyncProvider | null ) => {
	if ( provider ) {
		// If a provider already exists, return it.
		return provider;
	}

	const serverUrl = getWebSocketUrl();

	// We already error check for the WebSocket URL in the main plugin file,
	// so this is here for safety.
	if ( ! serverUrl ) {
		console.error(
			'VIP Real-Time Collaboration WebSocket URL has not been configured. The plugin will not be functional without it.'
		);
		return null;
	}

	const remoteConnection = createWebSocketConnection( {
		serverUrl,
	} );

	return createSyncProvider( null, remoteConnection );
} );
