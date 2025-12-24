/**
 * Connection limits enforcement
 *
 * Enforces soft and hard connection limits to prevent server overload while ensuring
 * atomic client behavior. Each sync-enabled entity (post, widget, pattern, etc.) requires
 * a separate WebSocket connection. When the server reaches soft capacity, only clients
 * with existing connections can establish additional connections, ensuring atomic
 * behavior - either all required entities connect or none do.
 *
 * A client represents a single browser tab session. The wp_client_id is a UUID
 * generated in-memory per page load and changes on refresh. Multiple tabs from
 * the same user are independent clients.
 */

import { MAX_CONNECTIONS, BUFFER_CONNECTIONS } from './config';

import type { WebSocketServer } from 'ws';

/**
 * Calculate soft limit from max connections and buffer
 */
function calculateSoftLimit( max: number, buffer: number ): number {
	// Disable soft limit for small connection limits
	if ( max < buffer * 2 ) {
		return max;
	}

	return max - buffer;
}

/**
 * Check if a client has any active connections
 */
function isClientActive( wss: WebSocketServer, wpClientId: string | null ): boolean {
	if ( ! wpClientId ) {
		return false;
	}

	for ( const ws of wss.clients ) {
		if ( ws.wpClientId === wpClientId ) {
			return true;
		}
	}

	return false;
}

/**
 * Calculate and cache soft limit at module load
 */
const softLimit = calculateSoftLimit( MAX_CONNECTIONS, BUFFER_CONNECTIONS );

/**
 * Get the total number of active WebSocket connections
 */
export function getActiveConnectionCount( wss: WebSocketServer ): number {
	return wss.clients.size;
}

/**
 * Get the count of active clients for monitoring
 *
 * Derives count from wss.clients by counting unique wpClientId values
 */
export function getActiveClientCount( wss: WebSocketServer ): number {
	return new Set( Array.from( wss.clients ).map( ws => ws.wpClientId ) ).size;
}

/**
 * Check if a new connection should be allowed based on current limits
 */
export function shouldAllowConnection( wss: WebSocketServer, wpClientId: string | null ): boolean {
	// No limit configured
	if ( MAX_CONNECTIONS === -1 ) {
		return true;
	}

	const currentTotalConnections = getActiveConnectionCount( wss );

	// Check max limit (never exceed)
	if ( currentTotalConnections > MAX_CONNECTIONS ) {
		return false;
	}

	// Check soft limit (reject new clients, allow existing clients)
	if ( currentTotalConnections > softLimit && ! isClientActive( wss, wpClientId ) ) {
		return false;
	}

	return true;
}
