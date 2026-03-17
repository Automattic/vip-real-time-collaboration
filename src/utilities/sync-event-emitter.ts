/**
 * External dependencies
 */
import type { ConnectionStatus } from '@wordpress/sync';

type ConnectionStatusCallback = ( state: ConnectionStatus ) => void;

/**
 * A simple typed event emitter for sync connection status events.
 *
 * This provides a clean, type-safe way to handle the 'sync-connection-status' event
 * without relying on type assertions or extending the WebsocketProvider's event system.
 */
export class SyncConnectionStatusEmitter {
	private listeners: Set< ConnectionStatusCallback > = new Set();

	public emit( status: ConnectionStatus ): void {
		this.listeners.forEach( listener => listener( status ) );
	}

	public on( callback: ConnectionStatusCallback ): void {
		this.listeners.add( callback );
	}

	public off( callback: ConnectionStatusCallback ): void {
		this.listeners.delete( callback );
	}

	public destroy(): void {
		this.listeners.clear();
	}
}
