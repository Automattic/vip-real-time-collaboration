import { addFilter } from '@wordpress/hooks';

addFilter(
	'core.getSyncProviderRemoteConnection',
	'vip-realtime-collaboration',
	( connection: ConnectDoc | null, connectionCreators: RemoteConnectionCreators ) => {
		if ( connection ) {
			return connection;
		}

		return connectionCreators.createWebSocketConnection( {
			serverUrl: 'wss://real-time-collaboration-poc-node.go-vip.net/_ws/',
		} );
	}
);
