import http from 'http';
import { register, Counter, Gauge, Histogram } from 'prom-client';
import type { RawData, WebSocketServer } from 'ws';

/**
 * ------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------
 */
const METRICS_MAINTENANCE_INTERVAL = 60 * 1000; // 60 seconds

/**
 * ------------------------------------------------------------
 * Constants with overrides from environment variables
 * ------------------------------------------------------------
 */
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

/**
 * ------------------------------------------------------------
 * Helper functions
 * ------------------------------------------------------------
 */
export function getRequestPathname( request: http.IncomingMessage ): string {
	const pathname = request.url?.split( '?' )[ 0 ] || '/';
	// Remove trailing slashes (except for root path)
	return pathname === '/' ? pathname : pathname.replace( /\/+$/, '' );
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
 * Metrics tracking functions
 * ------------------------------------------------------------
 */
function reconcileConnectedClients( wss: WebSocketServer ): void {
	connectedClientsGauge.set( wss.clients.size );
}

export function recordMessage( data: RawData, isBinary: boolean ): void {
	messagesCounter.inc();

	if ( isBinary ) {
		messageBytesCounter.inc( getRawDataSizeBytes( data ) );
	}
}

export function recordAuthFailure( reason: string ): void {
	authFailuresCounter.inc( { reason } );
}

export function recordConnectionOpen( connectionId: string | null ): void {
	connectedClientsGauge.inc();
	checkReconnection( connectionId );
}

export function recordConnectionClose(
	code: number,
	connectionStartTime: number,
	connectionId: string | null
): void {
	connectedClientsGauge.dec();
	connectionCloseCounter.inc( { code: code.toString() } );

	const now = Date.now();
	const durationSeconds = ( now - connectionStartTime ) / 1000;
	connectionDurationHistogram.observe( durationSeconds );

	trackDisconnection( connectionId, now );
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

	recentDisconnects.forEach( ( disconnectTime, connectionId ) => {
		if ( now - disconnectTime > cleanupThreshold ) {
			recentDisconnects.delete( connectionId );
		}
	} );
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
 * Server & Maintenance
 * ------------------------------------------------------------
 */
export function createMetricsServer(): http.Server {
	return http.createServer( async ( request, response ) => {
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
}

/**
 * Perform maintenance operations for metrics in a loop:
 * - Cleanup old disconnect entries
 * - Reconcile connected clients
 */
export function startMetricsMaintenanceLoop( wss: WebSocketServer ): void {
	setInterval( () => {
		cleanupOldDisconnects();
		reconcileConnectedClients( wss );
	}, METRICS_MAINTENANCE_INTERVAL );
}
