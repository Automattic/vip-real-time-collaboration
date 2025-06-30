import { addFilter } from '@wordpress/hooks';

// Define the VIP_RTC interface
interface VIPRTCConfig {
  wsUrl: string;
}

// Declare VIP_RTC as a global variable
declare const VIP_RTC: VIPRTCConfig | undefined;

addFilter(
	'core.getSyncProviderRemoteConnection',
	'vip-realtime-collaboration',
	( connection: ConnectDoc | null, connectionCreators: RemoteConnectionCreators ) => {
		if ( connection ) {
			// If a connection already exists, return it.
			return connection;
		}

		if ( ! VIP_RTC || ! VIP_RTC.wsUrl  ) {
			console.warn( 'VIP RTC WebSocket URL is not defined.' );
			return null;
		}

		console.log( 'Creating WebSocket connection to:', VIP_RTC.wsUrl );

		return connectionCreators.createWebSocketConnection( {
			serverUrl: VIP_RTC.wsUrl,
		} );
	}
);
