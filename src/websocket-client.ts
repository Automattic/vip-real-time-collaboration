/**
 * External dependencies
 */
import { v4 as uuidv4 } from 'uuid';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import { WebsocketProvider, type WebsocketProviderOptions } from 'y-websocket';

import { getWebSocketUrl } from '@/utilities/config';
import { getErrorMessage } from '@/utilities/error';
import { memoizeFn } from '@/utilities/function';

import type { ConnectDoc } from '@wordpress/sync';
import type * as Y from 'yjs';

export interface WebSocketConnectionConfig {
	onStatusChange?: (
		event: { status: 'connected' | 'connecting' | 'connection-error' | 'disconnected' },
		provider: WebsocketProvider
	) => void;
	options?: WebsocketProviderOptions;
	serverUrl: string;
}

/**
 * Creates a connection ID generator with in-memory storage
 */
const getConnectionId = memoizeFn( (): string => uuidv4() );

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
			connectionId: getConnectionId(),
		},
	} );

	if ( ! data.token ) {
		throw new Error( __( 'No auth token returned', 'vip-real-time-collaboration' ) );
	}

	return data.token;
}

/**
 * Log a link to inspect the Yjs provider using Yjs inspector.
 */
function logInspectUrl( syncObjectType: string, syncObjectId: string, authToken: string ): void {
	const roomName = `${ syncObjectType }-${ syncObjectId }`;
	const connectionConfig = {
		createNewDoc: false,
		room: `${ roomName }?auth=${ authToken }`,
		provider: 'y-websocket',
		url: getWebSocketUrl(),
	};

	// The inspect URL always targets a local Yjs inspector.
	const inspectUrl = `http://localhost:5173/#/connection=${ encodeURIComponent(
		JSON.stringify( connectionConfig )
	) }`;

	// eslint-disable-next-line no-console
	console.debug( `Inspect Yjs provider for ${ roomName }: ${ inspectUrl }` );
}

/**
 * Configure the websocket provider to use auth token for websocket connection.
 */
function createConnect(
	provider: WebsocketProvider,
	syncObjectType: string,
	syncObjectId: string
): () => Promise< void > {
	return async function (): Promise< void > {
		try {
			const authToken = await fetchAuthToken( syncObjectType, syncObjectId );

			provider.params = {
				auth: authToken,
			};
			provider.connect();

			// Disable provider#shouldConnect to prevent websocket from attempting to
			// reconnect before the new auth token is fetched (they are short-lived).
			// When provider.connect() runs it updates provider#shouldConnect to true.
			provider.shouldConnect = false;

			logInspectUrl( syncObjectType, syncObjectId, authToken );
		} catch ( error: unknown ) {
			const errorMessage = getErrorMessage( error );
			// eslint-disable-next-line no-console
			console.error(
				`[RTC:WebSocket] ${ __(
					'Failed to fetch auth token and connect to WebSocket',
					'vip-real-time-collaboration'
				) }: ${ errorMessage }`
			);
		}
	};
}

export function getWebSocketConnectionConfig(): WebSocketConnectionConfig {
	return {
		serverUrl: getWebSocketUrl(),
		options: {
			/**
			 * Disable automatic connection to prevent websocket from attempting to connect
			 * before the auth token is fetched.
			 */
			connect: false,
		},
	};
}

/**
 * Function that creates a new WebSocket Connection.
 *
 * @param {WebsocketConnectionConfig} config The configuration for the WebSocket connection.
 * @return {ConnectDoc} A function that connects a Y.Doc to a WebSocket server.
 */
export function createWebSocketConnection( config: WebSocketConnectionConfig ): ConnectDoc {
	return async function ( objectId: string = 'unknown', objectType: string, doc: Y.Doc ) {
		try {
			const roomName = `${ objectType }-${ objectId }`;
			const provider = new WebsocketProvider( config.serverUrl, roomName, doc, config.options );
			const connect = createConnect( provider, objectType, objectId );

			provider.on( 'connection-close', connect );
			provider.on( 'connection-error', () => {
				// The provider does not change status on connection error, so we
				// manually trigger a synthetic status change.
				config.onStatusChange?.( { status: 'connection-error' }, provider );
			} );
			provider.on( 'status', event => config.onStatusChange?.( event, provider ) );

			// Uncomment the following lines to provide debugging functions.

			// window.DISCONNECT_WEB_SOCKET = () => {
			// 	provider.off( 'connection-close', connect );
			// 	provider.disconnect();
			// };

			// window.RECONNECT_WEB_SOCKET = () => {
			// 	provider.on( 'connection-close', connect );
			// 	void connect();
			// };

			await connect();

			return {
				awareness: provider.awareness,
				destroy: () => provider.destroy(),
			};
		} catch {}

		return {
			destroy: () => {},
		};
	};
}
