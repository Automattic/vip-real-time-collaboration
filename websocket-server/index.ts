import { setPersistence, setupWSConnection } from '@y/websocket-server/utils';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { RawData, WebSocketServer, type WebSocket } from 'ws';

import { getConnectionId, isRequestAuthenticated } from './auth';
import { ClientConnectionStore } from './client-connections';
import {
	DEFAULT_CONNECTION_TIMEOUT,
	DEFAULT_HOST,
	DEFAULT_PORT,
	JWT_SECRET,
	MAX_CONNECTIONS,
	WEBSOCKET_CLOSE_CODES,
} from './config';
import {
	recordMessage,
	recordConnectionClose,
	recordConnectionFailure,
	createMetricsServer,
	startMetricsMaintenanceLoop,
	recordConnectionOpen,
} from './metrics';
import { NoopPersistenceProvider } from './noop-persistence-provider';
import { getRequestPathname } from './utils';

import type { Duplex } from 'node:stream';

/**
 * ------------------------------------------------------------
 * Constants with overrides from environment variables
 * ------------------------------------------------------------
 */
const wss = new WebSocketServer( { noServer: true } );
const host = process.env.HOST || DEFAULT_HOST;
const port = parseInt( process.env.PORT || '', 10 ) || DEFAULT_PORT;
const connectionTimeout =
	parseInt( process.env.CONNECTION_TIMEOUT || '', 10 ) || DEFAULT_CONNECTION_TIMEOUT;

/**
 * ------------------------------------------------------------
 * Client connection store with configured limits
 * ------------------------------------------------------------
 */
export const clientConnectionStore = new ClientConnectionStore( {
	max: MAX_CONNECTIONS,
} );

/**
 * ------------------------------------------------------------
 * Server Configuration
 * ------------------------------------------------------------
 */
const server = http.createServer( ( request: IncomingMessage, response: ServerResponse ): void => {
	const pathname = getRequestPathname( request );

	if ( [ '/cache-healthcheck', '/health', '/ready' ].includes( pathname ) ) {
		/**
		 * Used by k8s for LivenessProbe and ReadinessProbe
		 */
		response.writeHead( 200, { 'Content-Type': 'text/plain' } );
		response.end( 'OK' );
		return;
	}

	/**
	 * Return 404 for unknown paths
	 */
	response.writeHead( 404, { 'Content-Type': 'text/plain' } );
	response.end( 'Not Found' );
} );

// Use NoopPersistenceProvider to avoid persisting document updates to storage
// while still allowing documents to be evicted from memory when there are
// no active connections.
setPersistence( new NoopPersistenceProvider() );

/**
 * ------------------------------------------------------------
 * WebSocket connection handling
 * ------------------------------------------------------------
 */
wss.on( 'connection', ( ws: WebSocket, request: IncomingMessage ) => {
	const connectionStartTime = Date.now();
	const connectionId = getConnectionId( request, JWT_SECRET );
	clientConnectionStore.addConnection( connectionId );

	/**
	 * Set up the connection
	 */
	setupWSConnection( ws, request );

	recordConnectionOpen( connectionId, clientConnectionStore.getActiveClientCount() );

	/**
	 * Track message metrics
	 */
	ws.on( 'message', ( data: RawData, isBinary: boolean ): void => {
		recordMessage( data, isBinary );
	} );

	/**
	 * Disconnect after some time to force a reconnect
	 * with new auth token
	 */
	const timeout = setTimeout( (): void => {
		// 4001 - custom close code for connection timeout
		ws.close( 4001, WEBSOCKET_CLOSE_CODES.get( 4001 ) );
	}, connectionTimeout );

	/**
	 * Clear timeout and update metrics when connection closes
	 */
	ws.on( 'close', ( code: number ): void => {
		clearTimeout( timeout );
		clientConnectionStore.removeConnection( connectionId );
		recordConnectionClose(
			code,
			connectionStartTime,
			connectionId,
			clientConnectionStore.getActiveClientCount()
		);
	} );
} );

server.on( 'upgrade', ( request: IncomingMessage, socket: Duplex, head: Buffer ): void => {
	/**
	 * Verify authentication before establishing WebSocket connection
	 */
	const authResult = isRequestAuthenticated( request, JWT_SECRET );
	if ( authResult.authenticated === false ) {
		recordConnectionFailure( authResult.reason );
		socket.write( 'HTTP/1.1 401 Unauthorized\r\n\r\n' );
		socket.destroy();
		return;
	}

	wss.handleUpgrade( request, socket, head, ( ws: WebSocket ): void => {
		/**
		 * Check connection limits
		 */
		if (
			! clientConnectionStore.shouldAllowConnection(
				getConnectionId( request, JWT_SECRET ),
				wss.clients.size
			)
		) {
			recordConnectionFailure( 'connection_limit_exceeded' );
			ws.close( 4002, WEBSOCKET_CLOSE_CODES.get( 4002 ) );
			return;
		}

		wss.emit( 'connection', ws, request );
	} );
} );

/**
 * ------------------------------------------------------------
 * Server start
 * ------------------------------------------------------------
 */
server.listen( port, host, (): void => {
	// eslint-disable-next-line no-console
	console.log( `WebSocket server running at ws://${ host }:${ port }` );
} );

// Start the metrics server only if METRICS_PORT is set.
if ( process.env.METRICS_PORT ) {
	const metricsPort = parseInt( process.env.METRICS_PORT, 10 );
	const metricsServer = createMetricsServer();

	metricsServer.listen( metricsPort, host, (): void => {
		// eslint-disable-next-line no-console
		console.log( `WebSocket metrics server running at http://${ host }:${ metricsPort }` );

		startMetricsMaintenanceLoop( wss );
	} );
}
