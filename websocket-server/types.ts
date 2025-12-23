/**
 * Type extensions for WebSocket
 *
 * Extends the WebSocket type from the 'ws' library to include custom properties
 * for tracking client identity across multiple connections.
 */

import type {} from 'ws';

declare module 'ws' {
	interface WebSocket {
		/**
		 * Client identifier from JWT token
		 *
		 * Represents a single browser tab session. The connection_id is a UUID
		 * generated in-memory per page load and changes on refresh.
		 */
		wpClientId?: string;
	}
}
