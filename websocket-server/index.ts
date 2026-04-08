import { setPersistence, setupWSConnection } from '@y/websocket-server/utils';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { RawData, WebSocketServer, type WebSocket } from 'ws';

import { getWpClientId, isRequestAuthenticated, isSessionAuthenticated } from './auth';
import {
	DEFAULT_CONNECTION_TIMEOUT,
	DEFAULT_HOST,
	DEFAULT_PORT,
	JWT_SECRET,
	WEBSOCKET_CLOSE_CODES,
} from './config';
import { shouldAllowConnection, getActiveClientCount } from './connection-limits';
import {
	recordMessage,
	recordConnectionClose,
	recordConnectionFailure,
	createMetricsServer,
	startMetricsMaintenanceLoop,
	recordConnectionOpen,
} from './metrics';
import { handleMultiplexedConnection } from './multiplexed-handler';
import { NoopPersistenceProvider } from './noop-persistence-provider';
import './types';
import { getRequestPathname } from './utils';

import type { Duplex } from 'node:stream';

/**
 * ------------------------------------------------------------
 * Constants with overrides from environment variables
 * ------------------------------------------------------------
 */
const wss = new WebSocketServer( { noServer: true } );
const muxWss = new WebSocketServer( { noServer: true } );
const host = process.env.HOST || DEFAULT_HOST;
const port = parseInt( process.env.PORT || '', 10 ) || DEFAULT_PORT;
const connectionTimeout =
	parseInt( process.env.CONNECTION_TIMEOUT || '', 10 ) || DEFAULT_CONNECTION_TIMEOUT;

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
	const wpClientId = getWpClientId( request, JWT_SECRET );

	/**
	 * Store client ID on WebSocket for tracking
	 */
	ws.wpClientId = wpClientId ?? undefined;

	/**
	 * Set up the connection
	 */
	setupWSConnection( ws, request );

	recordConnectionOpen( wpClientId, getActiveClientCount( wss ) );

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
		recordConnectionClose( code, connectionStartTime, wpClientId, getActiveClientCount( wss ) );
	} );
} );

/**
 * ------------------------------------------------------------
 * Multiplexed WebSocket connection handling
 * ------------------------------------------------------------
 */
muxWss.on( 'connection', ( ws: WebSocket, request: IncomingMessage ) => {
	const connectionStartTime = Date.now();

	// Session auth was already verified in the upgrade handler.
	// Re-parse the token to extract wpClientId for metrics/tracking.
	const sessionResult = isSessionAuthenticated( request, JWT_SECRET );
	const wpClientId =
		sessionResult.authenticated === true ? sessionResult.payload.wp_client_id : 'unknown';
	ws.wpClientId = wpClientId;

	handleMultiplexedConnection( ws, wpClientId, JWT_SECRET );

	recordConnectionOpen( wpClientId, getActiveClientCount( wss ) + getActiveClientCount( muxWss ) );

	ws.on( 'message', ( data: RawData, isBinary: boolean ): void => {
		recordMessage( data, isBinary );
	} );

	const timeout = setTimeout( (): void => {
		ws.close( 4001, WEBSOCKET_CLOSE_CODES.get( 4001 ) );
	}, connectionTimeout );

	ws.on( 'close', ( code: number ): void => {
		clearTimeout( timeout );
		recordConnectionClose(
			code,
			connectionStartTime,
			wpClientId,
			getActiveClientCount( wss ) + getActiveClientCount( muxWss )
		);
	} );
} );

server.on( 'upgrade', ( request: IncomingMessage, socket: Duplex, head: Buffer ): void => {
	const pathname = getRequestPathname( request );

	/**
	 * Multiplexed WebSocket endpoint — authenticates with a session token,
	 * individual rooms are authorized via room:join control messages.
	 */
	if ( pathname === '/_mux' ) {
		const sessionResult = isSessionAuthenticated( request, JWT_SECRET );
		if ( sessionResult.authenticated === false ) {
			recordConnectionFailure( sessionResult.reason );
			socket.write( 'HTTP/1.1 401 Unauthorized\r\n\r\n' );
			socket.destroy();
			return;
		}

		muxWss.handleUpgrade( request, socket, head, ( ws: WebSocket ): void => {
			if ( ! shouldAllowConnection( muxWss, sessionResult.payload.wp_client_id ) ) {
				recordConnectionFailure( 'connection_limit_exceeded' );
				ws.close( 4002, WEBSOCKET_CLOSE_CODES.get( 4002 ) );
				return;
			}

			muxWss.emit( 'connection', ws, request );
		} );
		return;
	}

	/**
	 * Legacy per-room WebSocket endpoint — authenticates with a room-scoped token.
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
		if ( ! shouldAllowConnection( wss, getWpClientId( request, JWT_SECRET ) ) ) {
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
