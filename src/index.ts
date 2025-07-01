import { addFilter } from '@wordpress/hooks';

import { getWebSocketUrl } from './utils';

addFilter(
	'core.getSyncProviderRemoteConnection',
	'vip-realtime-collaboration',
	( connection: ConnectDoc | null, connectionCreators: RemoteConnectionCreators ) => {
		if ( connection ) {
			// If a connection already exists, return it.
			return connection;
		}

		// We already error check for the WebSocket URL in the main plugin file,
		// so this is here for safety.
		const serverUrl = getWebSocketUrl();
		// ToDo: Remove this before we go into production.
		// eslint-disable-next-line no-console
		console.log( 'WebSocket URL:', serverUrl );

		if ( ! serverUrl ) {
			// ToDo: Replace this with a proper UI notice.
			// eslint-disable-next-line no-console
			console.error(
				'VIP Realtime Collaboration WebSocket URL has not been configured. The plugin will not be functional without it.'
			);
			return null;
		}

		return connectionCreators.createWebSocketConnection( {
			serverUrl,
		} );
	}
);
