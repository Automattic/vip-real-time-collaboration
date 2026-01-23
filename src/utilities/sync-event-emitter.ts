/**
 * External dependencies
 */
import type { SyncConnectionState } from '@wordpress/sync';

type SyncConnectionStatusCallback = ( state: SyncConnectionState ) => void;

/**
 * A simple typed event emitter for sync connection status events.
 *
 * This provides a clean, type-safe way to handle the 'sync-connection-status' event
 * without relying on type assertions or extending the WebsocketProvider's event system.
 */
export class SyncConnectionStatusEmitter {
	private listeners: Set< SyncConnectionStatusCallback > = new Set();

	public emit( state: SyncConnectionState ): void {
		this.listeners.forEach( listener => listener( state ) );
	}

	public on( callback: SyncConnectionStatusCallback ): void {
		this.listeners.add( callback );
	}

	public off( callback: SyncConnectionStatusCallback ): void {
		this.listeners.delete( callback );
	}

	public destroy(): void {
		this.listeners.clear();
	}
}
