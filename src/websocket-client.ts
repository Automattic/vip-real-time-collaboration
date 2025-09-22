/**
 * External dependencies
 */
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import { WebsocketProvider, type WebsocketProviderOptions } from 'y-websocket';

import { AwarenessManager } from '@/awareness-manager';
import {
	isDevelopment,
	BLOG_ID,
	WEBSOCKET_PROVIDER_MAX_BACKOFF_IN_MS,
	WEBSOCKET_URL,
} from '@/utilities/config';
import { generateUUID } from '@/utilities/crypto';
import { getErrorMessage } from '@/utilities/error';
import { memoizeFn } from '@/utilities/function';
import { Logger } from '@/utilities/logger';

import type { ConnectDoc } from '@wordpress/sync';
import type { Awareness } from 'y-protocols/awareness.js';
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
const getConnectionId = memoizeFn( (): string => generateUUID() );

const logger = new Logger( 'websocket-client' );

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
function logInspectUrl( provider: WebsocketProvider ): void {
	const connectionConfig = {
		createNewDoc: false,
		room: `${ provider.roomname }?auth=${ provider.params?.auth }`,
		provider: 'y-websocket',
		url: WEBSOCKET_URL,
	};

	// The inspect URL always targets a local Yjs inspector.
	const inspectUrl = `http://localhost:5173/#/connection=${ encodeURIComponent(
		JSON.stringify( connectionConfig )
	) }`;

	logger.info( `Yjs inspector for ${ provider.roomname }: ${ inspectUrl }` );
}

/**
 * Configure the websocket provider to use auth token for websocket connection.
 * Implement exponential backoff for reconnect attempts since we are opting out
 * of the built-in reconnect logic by disabling `provider.shouldConnect`.
 */
function createConnect(
	provider: WebsocketProvider,
	syncObjectType: string,
	syncObjectId: string
): () => Promise< void > {
	let reconnectAttempts = 0;

	return async function (): Promise< void > {
		if ( reconnectAttempts > 0 ) {
			const backoffDelayInMs = Math.min(
				1000 * 2 ** reconnectAttempts,
				WEBSOCKET_PROVIDER_MAX_BACKOFF_IN_MS
			);

			logger.warn(
				`Attempting to reconnect to WebSocket in ${ Math.floor( backoffDelayInMs / 1000 ) }s...`
			);

			await new Promise( resolve => setTimeout( resolve, backoffDelayInMs ) );
		}

		reconnectAttempts += 1;

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

			logInspectUrl( provider );
		} catch ( error: unknown ) {
			logger.error(
				`${ __(
					'Failed to fetch auth token and connect to WebSocket',
					'vip-real-time-collaboration'
				) }: ${ getErrorMessage( error ) }`
			);
		}
	};
}

export function getWebSocketConnectionConfig( serverUrl: string ): WebSocketConnectionConfig {
	return {
		serverUrl,
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
	return async function (
		objectId: string = 'unknown',
		objectType: string,
		doc: Y.Doc,
		awareness?: Awareness
	) {
		try {
			/**
			 * Some entities like posts aren't unique across all sites in a multisite setup.
			 * To avoid conflicts, we add the blog ID to the room name.
			 *
			 * This might not be desired for entities like sites which are unique across the
			 * multisite. We don't sync entities like those yet. When we do, we'll need to revisit
			 * adding the blog ID to the room name as that won't be needed.
			 */
			const roomName = `site-${ BLOG_ID ?? 1 }/${ objectType }-${ objectId }`;
			const options = { ...config.options, awareness };
			const provider = new WebsocketProvider( config.serverUrl, roomName, doc, options );
			const connect = createConnect( provider, objectType, objectId );

			provider.on( 'connection-close', connect );
			provider.on( 'connection-error', () => {
				// The provider does not change status on connection error, so we
				// manually trigger a synthetic status change.
				config.onStatusChange?.( { status: 'connection-error' }, provider );
			} );
			provider.on( 'status', event => config.onStatusChange?.( event, provider ) );

			// Provide some debugging functions in development mode.
			if ( isDevelopment() ) {
				window.VIP_RTC.debug.disconnectWebSocket = () => {
					provider.off( 'connection-close', connect );
					provider.disconnect();
				};

				window.VIP_RTC.debug.reconnectWebSocket = () => {
					provider.on( 'connection-close', connect );
					void connect();
				};
			}

			if ( awareness ) {
				logger.debug( 'Initializing awareness for WebSocket connection', { objectType, objectId } );
				await AwarenessManager.initialize( awareness );
			}

			await connect();

			return {
				destroy: () => provider.destroy(),
			};
		} catch {}

		return {
			destroy: () => {},
		};
	};
}
