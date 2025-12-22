/**
 * Client connections tracking
 *
 * Tracks which clients (by connection_id) have active WebSocket connections.
 * Each sync-enabled entity establishes a separate WebSocket connection. When the server reaches
 * the soft limit, only clients with existing connections can establish connections for additional
 * entities, ensuring atomic behavior - either all required entities connect or none do.
 *
 * A client represents a single browser tab session. The connection_id is a UUID generated in-memory
 * per page load and changes on refresh. Multiple tabs from the same user are independent clients.
 */

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
	 * Map of connection_id to count of active connections for that client
	 */
	private clientConnections = new Map< string, number >();

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
		const MAX_BUFFER = 50;

		const calculated = Math.floor( max * SOFT_LIMIT_PERCENTAGE );
		const minSoft = max - MAX_BUFFER; // Ensure buffer never exceeds 50

		return Math.max( calculated, minSoft );
	}

	/**
	 * Add a new connection for a client
	 */
	public addConnection( connectionId: string | null ): void {
		if ( ! connectionId ) {
			return;
		}

		const currentCount = this.clientConnections.get( connectionId ) ?? 0;
		this.clientConnections.set( connectionId, currentCount + 1 );
	}

	/**
	 * Remove a connection for a client
	 */
	public removeConnection( connectionId: string | null ): void {
		if ( ! connectionId ) {
			return;
		}

		const currentCount = this.clientConnections.get( connectionId );
		if ( ! currentCount ) {
			return;
		}

		const newCount = Math.max( 0, currentCount - 1 );

		if ( newCount === 0 ) {
			this.clientConnections.delete( connectionId );
		} else {
			this.clientConnections.set( connectionId, newCount );
		}
	}

	/**
	 * Check if a client has any active connections
	 */
	public isClientActive( connectionId: string | null ): boolean {
		if ( ! connectionId ) {
			return false;
		}

		return this.clientConnections.has( connectionId );
	}

	/**
	 * Get the count of active clients for monitoring
	 */
	public getActiveClientCount(): number {
		return this.clientConnections.size;
	}

	/**
	 * Check if a new connection should be allowed based on current limits
	 */
	public shouldAllowConnection(
		connectionId: string | null,
		currentTotalConnections: number
	): boolean {
		// No limit configured
		if ( this.max === -1 ) {
			return true;
		}

		// Check max limit (never exceed)
		if ( currentTotalConnections >= this.max ) {
			return false;
		}

		// Check soft limit (reject new clients, allow existing clients)
		if ( currentTotalConnections >= this.soft && ! this.isClientActive( connectionId ) ) {
			return false;
		}

		return true;
	}
}
