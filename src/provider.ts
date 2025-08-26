/**
 * External dependencies
 */
import { select, subscribe } from '@wordpress/data';
import { store as editorStore } from '@wordpress/editor';

/**
 * Internal dependencies
 */
import { getCrdtDoc, updateCrdtDoc } from '@/api/crdt';
import { AwarenessManager } from '@/awareness-manager';
import { createWebSocketConnection, type WebSocketConnectionConfig } from '@/websocket-client';

import type {
	CRDTDoc,
	EntityID,
	ObjectData,
	ObjectID,
	ObjectType,
	SyncConfig,
} from '@wordpress/sync';
import type { WebsocketProvider } from 'y-websocket';

export class SyncProviderWithAwareness extends window.wp.sync.SyncProvider {
	private entitiesWithCrdtPersistence: Map< EntityID, [ ObjectType, ObjectID ] > = new Map();

	public constructor( config: WebSocketConnectionConfig ) {
		// There is no local persistence, so we pass `null` for the first argument.
		super(
			null,
			createWebSocketConnection( {
				...config,
				onStatusChange: ( ...args ) => this.onProviderStatusChange( ...args ),
			} )
		);

		this.subscribeToPostSave();
	}

	public async bootstrap(
		syncConfig: SyncConfig,
		record: ObjectData,
		handleChanges: ( data: Partial< ObjectData > ) => void
	): Promise< void > {
		await super.bootstrap( syncConfig, record, handleChanges );

		const objectType = syncConfig.objectType;
		const objectId = syncConfig.getObjectId( record );
		const entityId = this.getEntityId( objectType, objectId );

		const connections = this.connections.get( entityId ) ?? [];

		for ( const connection of connections ) {
			if ( connection.awareness && syncConfig.supportsAwareness ) {
				// eslint-disable-next-line no-await-in-loop
				await AwarenessManager.initialize( connection.awareness, entityId );
			}
		}

		// CRDT persistence is currently only supported for post types.
		if ( objectType.startsWith( 'postType/' ) ) {
			this.entitiesWithCrdtPersistence.set( entityId, [ objectType, objectId ] );
		}
	}

	protected async getInitialCRDTDoc(
		syncConfig: SyncConfig,
		record: ObjectData
	): Promise< CRDTDoc > {
		const objectId = syncConfig.getObjectId( record );

		// Attempt to load the initial CRDT document from post meta.
		const existingDoc = await getCrdtDoc( syncConfig.objectType, objectId );
		if ( existingDoc ) {
			return existingDoc;
		}

		// Otherwise, defer to the parent class method, which will create a new
		// document based on the persisted post content.
		const newDoc = await super.getInitialCRDTDoc( syncConfig, record );

		// Return the result from updateCrdtDoc. There is a chance that our doc
		// has been updated by the server!
		return await updateCrdtDoc( syncConfig.objectType, objectId, newDoc, true );
	}

	private subscribeToPostSave(): void {
		let hasPersistedCrdtDoc = false;

		// Listen for post save events to update the CRDT document.
		subscribe( () => {
			const { isAutosavingPost, isSavingPost } = select( editorStore );
			const shouldPersistCrdtDoc = isSavingPost() && ! isAutosavingPost();

			if ( shouldPersistCrdtDoc && ! hasPersistedCrdtDoc ) {
				this.entitiesWithCrdtPersistence.forEach( ( [ objectType, objectId ] ) => {
					void this.persistCrdtDoc( objectType, objectId );
				} );

				hasPersistedCrdtDoc = true;
			} else if ( ! shouldPersistCrdtDoc ) {
				hasPersistedCrdtDoc = false;
			}
		} );
	}

	private async persistCrdtDoc( objectType: ObjectType, objectId: ObjectID ): Promise< void > {
		const crdtDoc = this.getEntityState( objectType, objectId )?.ydoc;

		if ( ! crdtDoc ) {
			throw new Error( `CRDT document not found for ${ objectType } with ID ${ objectId }` );
		}

		await updateCrdtDoc( objectType, objectId, crdtDoc, false );
	}

	private onProviderStatusChange(
		event: { status: 'connected' | 'connecting' | 'connection-error' | 'disconnected' },
		provider: WebsocketProvider
	): void {
		switch ( event.status ) {
			case 'connecting': {
				break;
			}

			case 'connection-error': {
				AwarenessManager.setConnectionStatus( provider.awareness.clientID, false );
				break;
			}

			case 'connected': {
				AwarenessManager.setConnectionStatus( provider.awareness.clientID, true );
				break;
			}

			case 'disconnected': {
				AwarenessManager.setConnectionStatus( provider.awareness.clientID, false );
				break;
			}
		}
	}
}
