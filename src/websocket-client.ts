/**
 * External dependencies
 */
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';

import { MultiplexedConnection } from '@/multiplexed-connection';
import { MultiplexedRoomProvider } from '@/multiplexed-room-provider';
import { isDevelopment, BLOG_ID } from '@/utilities/config';
import { generateUUID } from '@/utilities/crypto';
import { WebSocketError, getErrorMessage } from '@/utilities/error';
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
 * Fetch a session-level authentication token for the multiplexed connection.
 * This proves user identity without binding to a specific room.
 */
async function fetchSessionToken(): Promise< string > {
	const data = await apiFetch< { token: string } >( {
		path: '/vip-rtc/v1/websocket/session-auth',
		method: 'POST',
		data: {
			wpClientId: getWpClientId(),
		},
	} );

	if ( ! data.token ) {
		throw new Error( __( 'No session auth token returned', 'vip-real-time-collaboration' ) );
	}

	return data.token;
}

/**
 * Map WebSocket close codes to Gutenberg sync error types.
 *
 * @param {number} code - WebSocket close code
 * @return {ConnectionError} Error for known error codes
 */
function getErrorFromCode( code?: number ): ConnectionError {
	switch ( code ) {
		case 4001:
			return new WebSocketError( 'connection-expired' );
		case 4002:
			return new WebSocketError( 'connection-limit-exceeded' );
		default:
			return new WebSocketError( 'unknown-error' );
	}
}

/**
 * Function that creates a new multiplexed WebSocket connection.
 *
 * A single physical WebSocket is shared across all rooms (entities) in an
 * editing session. Each room gets its own MultiplexedRoomProvider that
 * handles the Y.js sync and awareness protocols.
 *
 * @param {string} serverUrl The WebSocket server URL.
 * @return {ProviderCreator} A function that connects a Y.Doc to the multiplexed WebSocket.
 */
export function createWebSocketConnection( serverUrl: string ): ProviderCreator {
	// One shared connection for all rooms in this editing session.
	let connection: MultiplexedConnection | null = null;
	let connectionPromise: Promise< void > | null = null;

	async function ensureConnection(): Promise< MultiplexedConnection > {
		if ( connection && connection.isConnected() ) {
			return connection;
		}

		if ( ! connection ) {
			connection = new MultiplexedConnection( serverUrl, {
				sessionAuthProvider: fetchSessionToken,
				onStateChange: state => {
					logger.info( `Multiplexed connection: ${ state }` );

					// Reset the connection promise on disconnect so the next
					// ensureConnection() call fetches a fresh session token.
					if ( state === 'disconnected' ) {
						connectionPromise = null;
					}
				},
			} );
		}

		if ( ! connectionPromise ) {
			connectionPromise = ( async () => {
				try {
					const sessionToken = await fetchSessionToken();
					// connection may have been destroyed during the async fetch.
					if ( connection ) {
						connection.connect( sessionToken );
					}
				} catch ( error: unknown ) {
					// Reset so the next call retries.
					connectionPromise = null;
					logger.error(
						`Failed to establish multiplexed connection: ${ getErrorMessage( error ) }`
					);
					throw error;
				}
			} )();
		}

		await connectionPromise;

		// connection may have been destroyed during the async token fetch.
		if ( ! connection ) {
			throw new Error( 'Connection was destroyed during initialization' );
		}

		return connection;
	}

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

			const roomName = `site-${ BLOG_ID ?? 1 }/${ objectType }-${ objectId ?? 'collection' }`;
			const muxConnection = await ensureConnection();

			// Create a typed event emitter for sync-connection-status events.
			const syncStatusEmitter = new SyncConnectionStatusEmitter();

			// Auth provider for this room — used for initial join and reconnection.
			const roomAuthProvider = (): Promise< string > =>
				fetchAuthToken( objectType, objectId ?? 'collection' );

			// Create the per-room provider.
			const roomProvider = new MultiplexedRoomProvider(
				muxConnection,
				roomName,
				ydoc,
				awareness,
				() => {
					logger.info( `Room synced: ${ roomName }` );
				},
				( status, error ) => {
					const connectionStatus: ConnectionStatus = { status };
					if ( error ) {
						connectionStatus.error = getErrorFromCode( error.code );
					}
					syncStatusEmitter.emit( connectionStatus );
				},
				roomAuthProvider
			);

			// Fetch a per-room auth token and join.
			const authToken = await roomAuthProvider();
			roomProvider.join( authToken );

			// Provide some debugging functions in development mode.
			if ( isDevelopment() ) {
				const previousDisconnectFunction = window.VIP_RTC.debug.disconnectWebSocket;
				window.VIP_RTC.debug.disconnectWebSocket = () => {
					if ( previousDisconnectFunction ) {
						previousDisconnectFunction();
					}

					connection?.destroy();
				};

				const previousReconnectFunction = window.VIP_RTC.debug.reconnectWebSocket;
				window.VIP_RTC.debug.reconnectWebSocket = () => {
					if ( previousReconnectFunction ) {
						previousReconnectFunction();
					}

					// Destroy and re-establish the multiplexed connection.
					// NOTE: Existing room providers hold references to the old
					// connection and will not re-register with the new one.
					// This is a debug-only tool for testing reconnection flows.
					if ( connection ) {
						connection.destroy();
						connection = null;
						connectionPromise = null;
					}

					void ensureConnection();
				};
			}

			return {
				destroy: () => {
					syncStatusEmitter.destroy();
					roomProvider.destroy();

					// If no more rooms, tear down the shared connection.
					if ( connection && connection.getRoomCount() === 0 ) {
						connection.destroy();
						connection = null;
						connectionPromise = null;
					}
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
