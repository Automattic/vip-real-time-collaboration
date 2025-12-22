import http from 'http';
import { register, Counter, Gauge, Histogram } from 'prom-client';

import { getRawDataSizeBytes, getRequestPathname } from './utils';

import type { RawData, WebSocketServer } from 'ws';

/**
 * ------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------
 */
const METRICS_MAINTENANCE_INTERVAL = 60 * 1000; // 60 seconds
const METRICS_NAMESPACE = 'wpvip_rtc';

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
const activeConnectionsGauge = new Gauge( {
	name: `${ METRICS_NAMESPACE }_active_connections`,
	help: 'Number of currently active WebSocket connections',
} );

const activeClientsGauge = new Gauge( {
	name: `${ METRICS_NAMESPACE }_active_clients`,
	help: 'Number of active clients (unique connections by connection_id)',
} );

const messagesCounter = new Counter( {
	name: `${ METRICS_NAMESPACE }_messages_total`,
	help: 'Total number of WebSocket messages exchanged',
} );

const messageBytesCounter = new Counter( {
	name: `${ METRICS_NAMESPACE }_message_bytes_total`,
	help: 'Total bytes of WebSocket messages',
} );

const connectionCloseCounter = new Counter( {
	name: `${ METRICS_NAMESPACE }_connections_closed_total`,
	help: 'Total number of WebSocket connections closed',
	labelNames: [ 'code' ],
} );

const connectionFailuresCounter = new Counter( {
	name: `${ METRICS_NAMESPACE }_connection_failures_total`,
	help: 'Total number of WebSocket connection failures',
	labelNames: [ 'reason' ],
} );

const connectionDurationHistogram = new Histogram( {
	name: `${ METRICS_NAMESPACE }_connection_duration_seconds`,
	help: 'Duration of WebSocket connections in seconds',
	buckets: [ 1, 5, 15, 30, 60, 300, 900, 1800, 3600, 14400 ], // 1s to 4h
} );

const reconnectionTimeHistogram = new Histogram( {
	name: `${ METRICS_NAMESPACE }_reconnection_time_seconds`,
	help: 'Time between WebSocket disconnection and reconnection in seconds',
	buckets: [ 0.1, 0.5, 1, 2, 5, 10, 15, 30, 60 ], // 100ms to 60s
} );

/**
 * ------------------------------------------------------------
 * Metrics tracking functions
 * ------------------------------------------------------------
 */
function reconcileConnectedClients( wss: WebSocketServer ): void {
	activeConnectionsGauge.set( wss.clients.size );
}

export function recordMessage( data: RawData, isBinary: boolean ): void {
	messagesCounter.inc();

	if ( isBinary ) {
		messageBytesCounter.inc( getRawDataSizeBytes( data ) );
	}
}

export function recordConnectionFailure( reason: string ): void {
	connectionFailuresCounter.inc( { reason } );
}

export function recordConnectionOpen(
	connectionId: string | null,
	activeClientCount: number
): void {
	activeConnectionsGauge.inc();
	activeClientsGauge.set( activeClientCount );
	checkReconnection( connectionId );
}

export function recordConnectionClose(
	code: number,
	connectionStartTime: number,
	connectionId: string | null,
	activeClientCount: number
): void {
	activeConnectionsGauge.dec();
	activeClientsGauge.set( activeClientCount );
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
	// This is technically a type mismatch, but the function is async for syntactic
	// benefits. Node.js ignores the return value of the function and manages the
	// lifecycle of the request via `res` -- e.g., when `res.end()` is called, not
	// when the promise resolves.
	//
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
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
