import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';

import { getWebSocketUrl, getErrorMessage } from './utils';

/**
 * Fetch a fresh authentication token from the REST API.
 */
async function fetchAuthToken( syncObjectType: string, syncObjectId: string ): Promise< string > {
	const data = await apiFetch< { token: string } >( {
		path: '/vip-rtc/v1/websocket/auth',
		method: 'POST',
		data: {
			syncObjectType,
			syncObjectId,
		},
	} );

	if ( ! data.token ) {
		throw new Error( __( 'No auth token returned', 'vip-realtime-collaboration' ) );
	}

	return data.token;
}

const getOnConnectionClose = ( syncObjectType: string, syncObjectId: string ) => {
	/**
	 * Handle connection close event to fetch a new auth token and manually reconnect.
	 */
	return ( _event: CloseEvent | null, provider: WebsocketProvider ) => {
		/**
		 * Disable providershouldReconnect to prevent websocket from attempting to reconnect before
		 * the new auth token is fetched (they are short-lived).
		 * When the provider.connect() is called it attempts connection as well as updates
		 * provider.shouldConnect to true. Once that is updated, y-websocket will re-attempt
		 * connection with exponential backoff.
		 */
		provider.shouldConnect = false;

		fetchAuthToken( syncObjectType, syncObjectId )
			.then( authToken => {
				provider.params = {
					auth: authToken,
				};
				provider.connect();
			} )
			.catch( error => {
				const errorMessage = getErrorMessage( error );
				// eslint-disable-next-line no-console
				console.error(
					`[RTC:WebSocket] ${ __(
						'Failed to fetch auth token and reconnect to WebSocket',
						'vip-realtime-collaboration'
					) }: ${ errorMessage }`
				);
			} );
	};
};

/**
 * Configure the websocket provider to use auth token for websocket connection.
 */
const configureProvider = async (
	provider: WebsocketProvider,
	syncObjectType: string,
	syncObjectId: string
): Promise< void > => {
	provider.on( 'connection-close', getOnConnectionClose( syncObjectType, syncObjectId ) );

	try {
		const authToken = await fetchAuthToken( syncObjectType, syncObjectId );

		provider.params = {
			auth: authToken,
		};

		provider.connect();
	} catch ( error ) {
		const errorMessage = getErrorMessage( error );
		// eslint-disable-next-line no-console
		console.error(
			`[RTC:WebSocket] ${ __(
				'Failed to fetch auth token and connect to WebSocket',
				'vip-realtime-collaboration'
			) }: ${ errorMessage }`
		);
	}
};

export const getWebSocketConnectionConfig = (): WebSocketConnectionConfig => {
	/**
	 * We already error check for the WebSocket URL in the main plugin file,
	 * so this is here for safety.
	 */
	const serverUrl = getWebSocketUrl();

	if ( typeof serverUrl !== 'string' ) {
		/**
		 * Handled in index.ts.
		 */
		return {
			serverUrl: '',
		};
	}

	const config: WebSocketConnectionConfig = {
		serverUrl,
		options: {
			/**
			 * Disable automatic connection to prevent websocket from attempting to connect
			 * before the auth token is fetched.
			 */
			connect: false,
		},
		configureProvider,
	};

	return config;
};
