import { addFilter } from '@wordpress/hooks';

import { getWebSocketConnectionConfig } from './webSocketConnection';

addFilter(
	'core.getSyncProviderRemoteConnection',
	'vip-realtime-collaboration',
	( connection: ConnectDoc | null, connectionCreators: RemoteConnectionCreators ) => {
		if ( connection ) {
			// If a connection already exists, return it.
			return connection;
		}

		// Get WebSocket configuration
		const webSocketConnectionConfig = getWebSocketConnectionConfig();

		if ( webSocketConnectionConfig.serverUrl === '' ) {
			// ToDo: Replace this with a proper UI notice.
			// eslint-disable-next-line no-console
			console.error(
				'VIP Realtime Collaboration WebSocket URL has not been configured. The plugin will not be functional without it.'
			);
			return null;
		}

		return connectionCreators.createWebSocketConnection( webSocketConnectionConfig );
	}
);

addFilter( 'core.useSyncUndoManager', 'vip-realtime-collaboration', () => true );
