/**
 * Client connections tracking
 *
 * Tracks which clients (by connection_id) have active WebSocket connections.
 * Each sync-enabled entity (post, widget, pattern, etc.) establishes a separate
 * WebSocket connection. When the server reaches soft capacity, only clients with
 * existing connections can establish connections for additional entities, ensuring
 * atomic behavior - either all required entities connect or none do.
 *
 * A client represents a single browser tab session. The connection_id is a UUID
 * generated in-memory per page load and changes on refresh. Multiple tabs from
 * the same user are independent clients.
 *
 * This class derives all state from wss.clients (the source of truth) rather than
 * maintaining separate bookkeeping, preventing drift from edge cases where close
 * handlers don't fire.
 */

import type { WebSocketServer } from 'ws';

/**
 * Connection limits configuration
 */
export interface ConnectionLimits {
	max: number;
}

/**
 * Client connection store for managing active connections per client
 */
export class ClientConnectionStore {
	/**
	 * Maximum number of connections allowed
	 */
	private max: number;

	/**
	 * Soft limit - when reached, only existing clients can connect
	 */
	private soft: number;

	constructor( limits: ConnectionLimits ) {
		this.max = limits.max;
		this.soft = this.calculateSoftLimit( limits.max );
	}

	/**
	 * Calculate soft limit from max connections
	 * - If max < 50: soft = max (disabled)
	 * - Otherwise: soft = 90% of max
	 * - Buffer (max - soft) never exceeds 50
	 * This ensures that a large number of connections are not tied up as buffer and thus reducing
	 * the number of connections that can be established.
	 */
	private calculateSoftLimit( max: number ): number {
		// Disable soft limit for small connections limits
		if ( max < 50 ) {
			return max;
		}

		const SOFT_LIMIT_PERCENTAGE = 0.9;
		const MAX_RESERVED_CONNECTIONS = 50;

		const calculated = Math.floor( max * SOFT_LIMIT_PERCENTAGE );
		const minSoft = max - MAX_RESERVED_CONNECTIONS; // Ensure reserve never exceeds 50

		return Math.max( calculated, minSoft );
	}

	/**
	 * Check if a client has any active connections
	 */
	public isClientActive( connectionId: string | null, wss: WebSocketServer ): boolean {
		if ( ! connectionId ) {
			return false;
		}

		for ( const ws of wss.clients ) {
			if ( ws.wpClientId === connectionId ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Get the count of active clients for monitoring
	 *
	 * Derives count from wss.clients by counting unique wpClientId values
	 */
	public getActiveClientCount( wss: WebSocketServer ): number {
		return new Set( Array.from( wss.clients ).map( ws => ws.wpClientId ) ).size;
	}

	/**
	 * Check if a new connection should be allowed based on current limits
	 */
	public shouldAllowConnection( connectionId: string | null, wss: WebSocketServer ): boolean {
		// No limit configured
		if ( this.max === -1 ) {
			return true;
		}

		const currentTotalConnections = wss.clients.size;

		// Check max limit (never exceed)
		if ( currentTotalConnections >= this.max ) {
			return false;
		}

		// Check soft limit (reject new clients, allow existing clients)
		if ( currentTotalConnections >= this.soft && ! this.isClientActive( connectionId, wss ) ) {
			return false;
		}

		return true;
	}
}
