import apiFetch from '@wordpress/api-fetch';

function getWebSocketUrl(): string | undefined {
	return window.VIP_RTC?.wsUrl;
}

/**
 * Fetch a fresh authentication token from the REST API.
 */
async function fetchAuthToken(): Promise< string > {
	try {
		const data = await apiFetch< { token: string } >( {
			path: '/vip-rtc/v1/websocket/auth',
			method: 'POST',
		} );

		if ( ! data.token ) {
			throw new Error( 'Failed to fetch auth token' );
		}

		return data.token;
	} catch ( error ) {
		throw new Error(
			`Failed to fetch auth token: ${ error instanceof Error ? error.message : String( error ) }`
		);
	}
}

/**
 * Handle connection close event to fetch a new auth token and manually reconnect.
 */
const onConnectionClose = ( _event: CloseEvent | null, provider: WebsocketProvider ) => {
	/**
	 * Disable providershouldReconnect to prevent websocket from attempting to reconnect before
	 * the new auth token is fetched (they are short-lived).
	 * When the provider.connect() is called it attempts connection as well as updates
	 * provider.shouldConnect to true. Once that is updated, y-websocket will re-attempt
	 * connection with exponential backoff.
	 */
	provider.shouldConnect = false;

	fetchAuthToken()
		.then( authToken => {
			provider.params = {
				auth: authToken,
			};
			provider.connect();
		} )
		.catch( error => {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			// eslint-disable-next-line no-console
			console.error( `Failed to fetch auth token and reconnect: ${ errorMessage }` );
		} );
};

/**
 * Configure the websocket provider to use auth token for websocket connection.
 *
 * TODO: Pass objectType and objectId to fetch token API for performing
 * permission check in WP API before returning the auth token.
 */
const configureProvider = async (
	provider: WebsocketProvider,
	_syncObjectType: string,
	_syncObjectId: string
): Promise< void > => {
	provider.on( 'connection-close', onConnectionClose );

	const authToken = await fetchAuthToken();

	provider.params = {
		auth: authToken,
	};

	provider.connect();
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
