import { setupWSConnection } from '@y/websocket-server/utils';
import http from 'http';
import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import { register, Counter, Gauge, Histogram } from 'prom-client';

const jwtSecret = process.env.VIP_RTC_WS_AUTH_SECRET;
if ( ! jwtSecret ) {
	// eslint-disable-next-line no-console
	console.error( 'VIP_RTC_WS_AUTH_SECRET environment variable is not set' );
	process.exit( 1 );
}

/**
 * ------------------------------------------------------------
 * Types
 * ------------------------------------------------------------
 */
type AuthResult =
	| {
			authenticated: true;
	  }
	| {
			authenticated: false;
			reason: 'missing_token' | 'invalid_token' | 'invalid_payload';
	  };

interface SyncTokenPayload extends jwt.JwtPayload {
	user_id: number;
	username: string;
	room_name: string;
	connection_id?: string;
}

/**
 * ------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------
 */
const WEBSOCKET_CLOSE_CODES = new Map< number, string >( [
	[ 4001, 'Connection timed out. Reconnect.' ],
] );
const METRICS_MAINTENANCE_INTERVAL = 60 * 1000; // 60 seconds

/**
 * Default values
 */
const DEFAULT_CONNECTION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours in ms
const DEFAULT_PORT = 1234;
const DEFAULT_HOST = 'localhost';
const DEFAULT_METRICS_PORT = 9090;

/**
 * Constants with overrides from environment variables
 */
const wss = new WebSocketServer( { noServer: true } );
const host = process.env.HOST || DEFAULT_HOST;
const port = parseInt( process.env.PORT || '', 10 ) || DEFAULT_PORT;
const metricsPort = parseInt( process.env.METRICS_PORT || '', 10 ) || DEFAULT_METRICS_PORT;
const connectionTimeout =
	parseInt( process.env.CONNECTION_TIMEOUT || '', 10 ) || DEFAULT_CONNECTION_TIMEOUT;
const metricsTrackReconnectsWindow =
	parseInt( process.env.METRICS_TRACK_RECONNECTS_WINDOW || '', 10 ) || 60;

/**
 * ------------------------------------------------------------
 * In Memory State
 * ------------------------------------------------------------
 */
// Track recent disconnections for reconnection time measurement
const recentDisconnects = new Map< string, number >(); // connection_id -> disconnect_timestamp

/**
 * ------------------------------------------------------------
 * Prometheus metrics
 * ------------------------------------------------------------
 */
const connectedClientsGauge = new Gauge( {
	name: 'websocket_connected_clients',
	help: 'Number of currently connected WebSocket clients',
} );

const messagesCounter = new Counter( {
	name: 'websocket_messages_total',
	help: 'Total number of WebSocket messages exchanged',
} );

const messageBytesCounter = new Counter( {
	name: 'websocket_message_bytes_total',
	help: 'Total bytes of WebSocket messages',
} );

const authFailuresCounter = new Counter( {
	name: 'websocket_auth_failures_total',
	help: 'Total number of WebSocket authentication failures',
	labelNames: [ 'reason' ],
} );

const connectionCloseCounter = new Counter( {
	name: 'websocket_connections_closed_total',
	help: 'Total number of WebSocket connections closed',
	labelNames: [ 'code' ],
} );

const connectionDurationHistogram = new Histogram( {
	name: 'websocket_connection_duration_seconds',
	help: 'Duration of WebSocket connections in seconds',
	buckets: [ 1, 5, 15, 30, 60, 300, 900, 1800, 3600, 14400 ], // 1s to 4h
} );

const reconnectionTimeHistogram = new Histogram( {
	name: 'websocket_reconnection_time_seconds',
	help: 'Time between WebSocket disconnection and reconnection in seconds',
	buckets: [ 0.1, 0.5, 1, 2, 5, 10, 15, 30, 60 ], // 100ms to 60s
} );

function reconcileConnectedClients(): void {
	connectedClientsGauge.set( wss.clients.size );
}

/**
 * Store a disconnect event (cleanup handled by global interval)
 */
function trackDisconnection( connectionId: string | null, timestamp: number ): void {
	if ( ! connectionId ) {
		return;
	}

	recentDisconnects.set( connectionId, timestamp );
}

/**
 * Global cleanup process - removes old disconnect entries
 */
function cleanupOldDisconnects(): void {
	const now = Date.now();
	const cleanupThreshold = ( metricsTrackReconnectsWindow + 10 ) * 1000;

	for ( const [ connectionId, disconnectTime ] of recentDisconnects ) {
		if ( now - disconnectTime > cleanupThreshold ) {
			recentDisconnects.delete( connectionId );
		}
	}
}

/**
 * Check for reconnection and record metric if found
 */
function checkReconnection( connectionId: string | null ): void {
	if ( ! connectionId ) {
		return;
	}

	const disconnectTime = recentDisconnects.get( connectionId );
	const now = Date.now();

	if ( disconnectTime && now - disconnectTime <= metricsTrackReconnectsWindow * 1000 ) {
		const reconnectionTimeSeconds = ( now - disconnectTime ) / 1000;
		reconnectionTimeHistogram.observe( reconnectionTimeSeconds );

		// Remove from map since we found the reconnection
		recentDisconnects.delete( connectionId );
	}
}

/**
 * ------------------------------------------------------------
 * Helper functions
 * ------------------------------------------------------------
 */
function isSyncTokenPayload( payload: unknown ): payload is SyncTokenPayload {
	return (
		typeof payload === 'object' &&
		payload !== null &&
		'user_id' in payload &&
		'username' in payload &&
		'room_name' in payload
	);
}

function getRequestPathname( request: http.IncomingMessage ): string {
	const pathname = request.url?.split( '?' )[ 0 ] || '/';
	// Remove trailing slashes (except for root path)
	return pathname === '/' ? pathname : pathname.replace( /\/+$/, '' );
}

function verifyToken( token: string ): SyncTokenPayload {
	if ( ! jwtSecret ) {
		// Just to appease the type checker. Won't happen due to null check above.
		throw new Error( 'JWT secret not configured' );
	}
	const jwtPayload = jwt.verify( token, jwtSecret );
	if ( ! isSyncTokenPayload( jwtPayload ) ) {
		throw new Error( 'Invalid JWT payload' );
	}
	return jwtPayload;
}

function getConnectionId( request: http.IncomingMessage ): string | null {
	const searchParams = new URLSearchParams( request.url?.split( '?' )[ 1 ] || '' );
	const authToken = searchParams.get( 'auth' );
	if ( ! authToken ) {
		return null;
	}

	const jwtPayload = verifyToken( authToken );
	return jwtPayload.connection_id ?? null;
}

/**
 * Verify that the room_name in the JWT payload matches with the request URL
 * to guard against a token being used for the different sync object that it was issued for.
 *
 * TODO: Add additonal check for user_id
 */
function validateTokenPayload( request: http.IncomingMessage, jwtPayload: SyncTokenPayload ) {
	const { room_name: roomNameFromToken } = jwtPayload;
	const pathname = getRequestPathname( request );
	const roomNameFromUrl = pathname.replace( /^\//, '' );

	const isValid = roomNameFromToken === roomNameFromUrl;
	if ( ! isValid ) {
		// eslint-disable-next-line no-console
		console.error(
			`JWT decoded successfully but token payload is invalid: ${ JSON.stringify( {
				roomNameFromToken,
				roomNameFromUrl,
			} ) }`
		);
		return false;
	}
	return true;
}

function isRequestAuthenticated( request: http.IncomingMessage ): AuthResult {
	const searchParams = new URLSearchParams( request.url?.split( '?' )[ 1 ] || '' );
	const authToken = searchParams.get( 'auth' );

	if ( ! authToken ) {
		return { authenticated: false, reason: 'missing_token' };
	}

	try {
		const jwtPayload = verifyToken( authToken );
		const isValid = validateTokenPayload( request, jwtPayload );
		if ( ! isValid ) {
			return { authenticated: false, reason: 'invalid_payload' };
		}
		return { authenticated: true };
	} catch ( error ) {
		return { authenticated: false, reason: 'invalid_token' };
	}
}

function trackMessageBytes( data: RawData, isBinary: boolean ) {
	if ( isBinary ) {
		messageBytesCounter.inc( getRawDataSizeBytes( data ) );
	}
}

function getRawDataSizeBytes( data: RawData ): number {
	if ( Array.isArray( data ) ) {
		let total = 0;
		for ( const bufferChunk of data ) {
			total += bufferChunk.length;
		}
		return total;
	}

	if ( Buffer.isBuffer( data ) ) {
		return data.length;
	}

	if ( data instanceof ArrayBuffer ) {
		return data.byteLength;
	}

	return 0;
}

/**
 * ------------------------------------------------------------
 * Server Configuration
 * ------------------------------------------------------------
 */
const server = http.createServer( async ( request, response ) => {
	const pathname = getRequestPathname( request );

	if ( pathname === '/health' || pathname === '/ready' ) {
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

const metricsServer = http.createServer( async ( request, response ) => {
	const pathname = getRequestPathname( request );

	if ( pathname === '/metrics' ) {
		/**
		 * Prometheus metrics endpoint
		 */
		response.writeHead( 200, { 'Content-Type': register.contentType } );
		response.end( await register.metrics() );
		return;
	}

	/**
	 * Return 404 for unknown paths
	 */
	response.writeHead( 404, { 'Content-Type': 'text/plain' } );
	response.end( 'Not Found' );
} );

/**
 * ------------------------------------------------------------
 * WebSocket connection handling
 * ------------------------------------------------------------
 */
wss.on( 'connection', ( ws, request ) => {
	const connectionStartTime = Date.now();
	const connectionId = getConnectionId( request );

	// Increment connected clients
	connectedClientsGauge.inc();

	// Check for reconnection
	checkReconnection( connectionId );

	/**
	 * Set up the connection
	 */
	setupWSConnection( ws, request );

	/**
	 * Track message metrics
	 */
	ws.on( 'message', ( data, isBinary ) => {
		messagesCounter.inc();
		trackMessageBytes( data, isBinary );
	} );

	/**
	 * Disconnect after some time to force a reconnect
	 * with new auth token
	 */
	const timeout = setTimeout( () => {
		// 4001 - custom close code for connection timeout
		ws.close( 4001, WEBSOCKET_CLOSE_CODES.get( 4001 ) );
	}, connectionTimeout );

	/**
	 * Clear timeout and update metrics when connection closes
	 */
	ws.on( 'close', code => {
		connectionCloseCounter.inc( { code: code.toString() } );
		clearTimeout( timeout );

		// Decrement connected clients
		connectedClientsGauge.dec();

		// Record connection duration
		const durationSeconds = ( Date.now() - connectionStartTime ) / 1000;
		connectionDurationHistogram.observe( durationSeconds );

		// Track disconnection for potential reconnection measurement
		trackDisconnection( connectionId, Date.now() );
	} );
} );

server.on( 'upgrade', ( request, socket, head ) => {
	/**
	 * Verify authentication before establishing WebSocket connection
	 */
	const authResult = isRequestAuthenticated( request );
	if ( authResult.authenticated === false ) {
		authFailuresCounter.inc( { reason: authResult.reason } );
		socket.write( 'HTTP/1.1 401 Unauthorized\r\n\r\n' );
		socket.destroy();
		return;
	}

	wss.handleUpgrade( request, socket, head, ws => {
		wss.emit( 'connection', ws, request );
	} );
} );

/**
 * ------------------------------------------------------------
 * Periodic cleanup & reconciliation
 * ------------------------------------------------------------
 */

/**
 * Perform maintenance operations for metrics in a loop:
 * - Cleanup old disconnect entries
 * - Reconcile connected clients
 */
function startMetricsMaintenanceLoop(): void {
	setInterval( () => {
		cleanupOldDisconnects();
		reconcileConnectedClients();
	}, METRICS_MAINTENANCE_INTERVAL );
}

/**
 * ------------------------------------------------------------
 * Server start
 * ------------------------------------------------------------
 */
server.listen( port, host, () => {
	// eslint-disable-next-line no-console
	console.log( `WebSocket Server running at ws://${ host }:${ port }` );
} );

metricsServer.listen( metricsPort, host, () => {
	// eslint-disable-next-line no-console
	console.log( `WebSocket Metrics Server running at http://${ host }:${ metricsPort }` );

	startMetricsMaintenanceLoop();
} );
