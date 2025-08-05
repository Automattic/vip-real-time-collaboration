/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { AwarenessManager } from './awareness-manager';

import type { AwarenessStates, ObjectData, SyncConfig } from '@wordpress/sync';

export class SyncProviderWithAwareness extends window.wp.sync.SyncProvider {
	private awarenessManager = new AwarenessManager();

	public async bootstrap(
		syncConfig: SyncConfig,
		initialData: ObjectData,
		handleChanges: ( data: Partial< ObjectData > ) => void
	): Promise< void > {
		await super.bootstrap( syncConfig, initialData, handleChanges );

		const objectId = syncConfig.getObjectId( initialData );
		const objectType = syncConfig.objectType;
		const entityId = this.getEntityId( objectType, objectId );

		Array.from( this.connections.values() ).forEach( connection => {
			if ( connection.awareness ) {
				this.awarenessManager.bootstrap( entityId, connection.awareness );
			}
		} );
	}

	/**
	 * Get the states of all awareness documents.
	 */
	public getAllLocalAwarenessStates(): AwarenessStates {
		return this.awarenessManager.getAllLocalState();
	}

	/**
	 * Removes the states of all awareness documents.
	 */
	public removeAllLocalAwarenessStates(): void {
		return this.awarenessManager.removeAllLocalState();
	}
}
