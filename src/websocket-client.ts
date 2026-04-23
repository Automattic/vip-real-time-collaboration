/**
 * External dependencies
 */
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import { WebsocketProvider, type WebsocketProviderOptions } from 'y-websocket';

import {
	isDevelopment,
	BLOG_ID,
	WEBSOCKET_PROVIDER_MAX_BACKOFF_IN_MS,
	WEBSOCKET_URL,
} from '@/utilities/config';
import { generateUUID } from '@/utilities/crypto';
import { WebSocketError, getErrorMessage, isForbiddenAuthError } from '@/utilities/error';
import { memoizeFn } from '@/utilities/function';
import { Logger } from '@/utilities/logger';
import { SyncConnectionStatusEmitter } from '@/utilities/sync-event-emitter';

import type {
	ConnectionError,
	ConnectionStatus,
	ProviderCreator,
	ProviderCreatorOptions,
	ProviderCreatorResult,
	ProviderEventMap,
} from '@wordpress/sync';

export interface WebSocketConnectionConfig {
	options?: WebsocketProviderOptions;
	serverUrl: string;
}

const defaultResult: ProviderCreatorResult = {
	destroy: () => {},
	on: () => {},
};

/**
 * Creates a client ID generator with in-memory storage
 */
const getWpClientId = memoizeFn( (): string => generateUUID() );

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
			wpClientId: getWpClientId(),
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
 * Map WebSocket close codes to Gutenberg sync error types.
 *
 * @param {number} code - WebSocket close code
 * @return {ConnectionError} Error for known error codes
 */
function getErrorFromCloseCode( code?: number ): ConnectionError {
	switch ( code ) {
		case 4001:
			// Connection timeout - server forces reconnect after configured duration
			return new WebSocketError( 'connection-expired' );
		case 4002:
			// Server reached maximum connection limit
			return new WebSocketError( 'connection-limit-exceeded' );
		default:
			// Generic disconnection, no specific error
			return new WebSocketError( 'unknown-error' );
	}
}

/**
 * Configure the websocket provider to use auth token for websocket connection.
 * Implement exponential backoff for reconnect attempts since we are opting out
 * of the built-in reconnect logic by disabling `provider.shouldConnect`.
 */
function createConnect(
	provider: WebsocketProvider,
	syncObjectType: string,
	syncObjectId: string,
	initialAuthToken: string
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
			const authToken =
				reconnectAttempts === 1
					? initialAuthToken
					: await fetchAuthToken( syncObjectType, syncObjectId );

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
			if ( isForbiddenAuthError( error ) ) {
				logger.debug( 'WebSocket reconnect skipped: no permission for this sync object', {
					syncObjectType,
					syncObjectId,
				} );
			} else {
				logger.error(
					`${ __(
						'Failed to fetch auth token and connect to WebSocket',
						'vip-real-time-collaboration'
					) }: ${ getErrorMessage( error ) }`
				);
			}
		}
	};
}

/**
 * Function that creates a new WebSocket Connection.
 *
 * @param {string} serverUrl The WebSocket server URL.
 * @return {ProviderCreator} A function that connects a Y.Doc to a WebSocket server.
 */
export function createWebSocketConnection( serverUrl: string ): ProviderCreator {
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

	return async function ( {
		awareness,
		objectType,
		objectId,
		ydoc,
	}: ProviderCreatorOptions ): Promise< ProviderCreatorResult > {
		try {
			// For now, we only support collections and traditional post types.
			const isUnsupportedObjectType =
				null !== objectId &&
				( ! objectType.startsWith( 'postType/' ) || ! parseInt( objectId, 10 ) );

			if ( isUnsupportedObjectType ) {
				logger.debug( 'WebSocket connection skipped for unsupported object', {
					objectType,
					objectId,
				} );
				return defaultResult;
			}

			/**
			 * Some entities like posts aren't unique across all sites in a multisite setup.
			 * To avoid conflicts, we add the blog ID to the room name.
			 *
			 * This might not be desired for entities like sites which are unique across the
			 * multisite. We don't sync entities like those yet. When we do, we'll need to revisit
			 * adding the blog ID to the room name as that won't be needed.
			 */
			const roomName = `site-${ BLOG_ID ?? 1 }/${ objectType }-${ objectId ?? 'collection' }`;

			let initialAuthToken: string;
			try {
				initialAuthToken = await fetchAuthToken( objectType, objectId ?? 'collection' );
			} catch ( error: unknown ) {
				if ( isForbiddenAuthError( error ) ) {
					logger.debug( 'WebSocket connection skipped: user cannot sync this entity', {
						objectType,
						objectId,
					} );
					return defaultResult;
				}

				logger.error(
					`${ __(
						'Failed to fetch auth token and connect to WebSocket',
						'vip-real-time-collaboration'
					) }: ${ getErrorMessage( error ) }`
				);
				return defaultResult;
			}

			const options = {
				...config.options,
				awareness,
			};
			const provider = new WebsocketProvider( config.serverUrl, roomName, ydoc, options );
			const connect = createConnect(
				provider,
				objectType,
				objectId ?? 'collection',
				initialAuthToken
			);

			// Create a typed event emitter for our custom sync-connection-status event.
			const syncStatusEmitter = new SyncConnectionStatusEmitter();

			const handleConnectionClose = ( event: CloseEvent | null ): void => {
				// Emit custom sync-connection-status event
				syncStatusEmitter.emit( {
					status: 'disconnected',
					error: getErrorFromCloseCode( event?.code ),
				} );

				void connect();
			};

			provider.on( 'connection-close', handleConnectionClose );

			// Listen to y-websocket's status event for connecting/connected states
			provider.on( 'status', ( event: ConnectionStatus ) => {
				/*
				 * Skip 'disconnected' status - handled in connection-close above to preserve error details.
				 * y-websocket emits 'connection-close' (with error code) then 'status: disconnected' (no error).
				 */
				if ( event.status !== 'disconnected' ) {
					syncStatusEmitter.emit( { status: event.status } );
				}
			} );

			// Provide some debugging functions in development mode.
			if ( isDevelopment() ) {
				// Because there are multiple providers, disconnectWebSocket() and
				// reconnectWebSocket() will be overridden by the last entity or collection
				// provider created. Call the previous function if present.

				const previousDisconnectFunction = window.VIP_RTC.debug.disconnectWebSocket;
				window.VIP_RTC.debug.disconnectWebSocket = () => {
					if ( previousDisconnectFunction ) {
						previousDisconnectFunction();
					}

					provider.disconnect();
				};

				const previousReconnectFunction = window.VIP_RTC.debug.reconnectWebSocket;
				window.VIP_RTC.debug.reconnectWebSocket = () => {
					if ( previousReconnectFunction ) {
						previousReconnectFunction();
					}

					void connect();
				};
			}

			await connect();

			return {
				destroy: () => {
					syncStatusEmitter.destroy();
					provider.destroy();
				},
				on: < K extends keyof ProviderEventMap >(
					event: K,
					callback: ( data: ProviderEventMap[ K ] ) => void
				) => {
					if ( 'status' === event ) {
						syncStatusEmitter.on( callback );
					}
				},
			};
		} catch ( err ) {
			logger.critical( 'Failed to create WebSocket connection', { error: err } );
		}

		return defaultResult;
	};
}
