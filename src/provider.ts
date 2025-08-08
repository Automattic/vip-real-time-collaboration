/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { AwarenessManager } from './awareness-manager';

import type {
	AwarenessEventListener,
	AwarenessStates,
	ObjectData,
	ObjectID,
	ObjectType,
	SyncConfig,
} from '@wordpress/sync';

export class SyncProviderWithAwareness extends window.wp.sync.SyncProvider {
	private awarenessManager = new AwarenessManager();

	public async bootstrap(
		syncConfig: SyncConfig,
		initialData: ObjectData,
		handleChanges: ( data: Partial< ObjectData > ) => void
	): Promise< void > {
		await super.bootstrap( syncConfig, initialData, handleChanges );

		const objectType = syncConfig.objectType;
		const objectId = syncConfig.getObjectId( initialData );
		const entityId = this.getEntityId( objectType, objectId );

		const connections = Array.from( this.connections.values() ).flat();

		connections.forEach( connection => {
			console.log( '--- connection:', connection, {
				awareness: connection.awareness,
				supportsAwareness: syncConfig.supportsAwareness,
			} );
			if ( connection.awareness && syncConfig.supportsAwareness ) {
				this.awarenessManager.bootstrap( entityId, connection.awareness );
			}
		} );
	}

	public getAllAwarenessStates( objectType: ObjectType, objectId: ObjectID ): AwarenessStates {
		return this.awarenessManager.getAllStates( this.getEntityId( objectType, objectId ) );
	}

	public getLocalAwarenessStates( objectType: ObjectType, objectId: ObjectID ): AwarenessStates {
		return this.awarenessManager.getLocalStates( this.getEntityId( objectType, objectId ) );
	}

	public getLocalAwarenessState(
		objectType: ObjectType,
		objectId: ObjectID,
		field?: string
	): unknown {
		return this.awarenessManager.getLocalState( this.getEntityId( objectType, objectId ), field );
	}

	public removeAllAwarenessStates( objectType: ObjectType, objectId: ObjectID ): void {
		return this.awarenessManager.removeAllStates( this.getEntityId( objectType, objectId ) );
	}

	public setLocalAwarenessState(
		objectType: ObjectType,
		objectId: ObjectID,
		field: string,
		value: unknown
	): void {
		this.awarenessManager.setLocalState( this.getEntityId( objectType, objectId ), field, value );
	}

	public addAwarenessListener(
		objectType: ObjectType,
		objectId: ObjectID,
		eventType: 'ready' | 'change' | 'update',
		listener: AwarenessEventListener
	): void {
		this.awarenessManager.addListener(
			this.getEntityId( objectType, objectId ),
			eventType,
			listener
		);
	}
}
