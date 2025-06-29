import { addFilter } from '@wordpress/hooks';

addFilter(
	'core.getSyncProviderRemoteConnection',
	'vip-realtime-collaboration',
	( connection: ConnectDoc | null, connectionCreators: RemoteConnectionCreators ) => {
		if ( connection ) {
			return connection;
		}

		return connectionCreators.createWebSocketConnection( {
			serverUrl: 'ws://localhost:1234',
		} );
	}
);
