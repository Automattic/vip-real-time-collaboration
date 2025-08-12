/**
 * External dependencies
 */
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import { WebsocketProvider } from './y-websocket';
import { WebsocketProviderOptions } from 'y-websocket';

import { getErrorMessage, getWebSocketUrl } from './utils';

import type { ConnectDoc } from '@wordpress/sync';
import type * as Y from 'yjs';
import { websocket } from 'lib0';

interface WebSocketConnectionConfig {
	options?: WebsocketProviderOptions;
	password?: string;
	serverUrl: string;
}

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
		throw new Error( __( 'No auth token returned', 'vip-real-time-collaboration' ) );
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
						'vip-real-time-collaboration'
					) }: ${ errorMessage }`
				);
			} );
	};
};

/**
 * Configure the websocket provider to use auth token for websocket connection.
 */
async function configureProvider(
	provider: WebsocketProvider,
	syncObjectType: string,
	syncObjectId: string
): Promise< void > {
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
				'vip-real-time-collaboration'
			) }: ${ errorMessage }`
		);
	}
}

export function getWebSocketConnectionConfig(): WebSocketConnectionConfig {
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
	};

	return config;
}

/**
 * Function that creates a new WebSocket Connection.
 *
 * @param {WebsocketConnectionConfig} config The configuration for the WebSocket connection.
 * @return {ConnectDoc} A function that connects a Y.Doc to a WebSocket server.
 */
export function createWebSocketConnection( config: WebSocketConnectionConfig ): ConnectDoc {
	return function ( objectId: string = 'unknown', objectType: string, doc: Y.Doc ) {
		const roomName = `${ objectType }-${ objectId }`;
		let provider = null;

		try {
			provider = new WebsocketProvider( config.serverUrl, roomName, doc, config.options );
			void configureProvider( provider, objectType, objectId );
		} catch {}

		return Promise.resolve( {
			awareness: provider?.awareness,
			destroy: () => {
				// The WebsocketProvider handles its own cleanup. If needed, we could
				// implement a way to disconnect or clean up resources here.
			},
		} );
	};
}
