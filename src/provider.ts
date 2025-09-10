/**
 * Internal dependencies
 */
import { AwarenessManager } from '@/awareness-manager';
import {
	createPersistedCrdtDocMetaRecord,
	getCrdtDocVersion,
	getPersistedCrdtDocFromEntityMeta,
	type EntityMetaRecord,
} from '@/utilities/crdt';
import { getHashForEntityRecord, getMetaFromEntityRecord } from '@/utilities/entity';
import { Logger } from '@/utilities/logger';
import { createWebSocketConnection, type WebSocketConnectionConfig } from '@/websocket-client';

import type { CRDTDoc, ObjectData, RecordHandlers, SyncConfig } from '@wordpress/sync';
import type { WebsocketProvider } from 'y-websocket';

import { store as coreStore } from '@wordpress/core-data';
import { select } from '@wordpress/data';

export class SyncProviderWithAwareness extends window.wp.sync.SyncProvider {
	private logger: Logger = new Logger( 'provider' );

	public constructor( config: WebSocketConnectionConfig ) {
		// There is no local persistence, so we pass `null` for the first argument.
		super( [
			createWebSocketConnection( {
				...config,
				onStatusChange: ( ...args ) => this.onProviderStatusChange( ...args ),
			} ),
		] );
	}

	public async bootstrap(
		syncConfig: SyncConfig,
		record: ObjectData,
		handlers: RecordHandlers
	): Promise< void > {
		await super.bootstrap( syncConfig, record, handlers );

		const objectId = syncConfig.getObjectId( record ).toString();
		const objectType = syncConfig.objectType.toString();
		const entityId = this.getEntityId( objectType, objectId );

		this.logger.debug( 'Bootstrapping entity', { objectType, objectId } );

		const connections = this.connections.get( entityId ) ?? [];

		for ( const connection of connections ) {
			if ( connection.awareness && syncConfig.supports?.awareness ) {
				// eslint-disable-next-line no-await-in-loop
				await AwarenessManager.initialize( connection.awareness, entityId );
			}
		}
	}

	public async createEntityMeta(
		syncConfig: SyncConfig,
		record: ObjectData,
		changes: Partial< ObjectData >
	): Promise< EntityMetaRecord > {
		const objectId = syncConfig.getObjectId( record ).toString();
		const objectType = syncConfig.objectType.toString();

		// CRDT persistence is currently only supported for post types.
		if ( ! objectType.startsWith( 'postType/' ) ) {
			return {};
		}

		const ydoc = this.entityStates.get( this.getEntityId( objectType, objectId ) )?.ydoc;

		if ( ! ydoc || 'auto-draft' === record.status ) {
			return {};
		}

		const contentHash = await getHashForEntityRecord( { ...record, ...changes } );
		const entityMeta = createPersistedCrdtDocMetaRecord( ydoc, contentHash );

		this.logger.debug( 'Providing updated entity meta to saveEntityRecord', {
			objectType,
			objectId,
			entityMeta,
		} );

		return entityMeta;
	}

	protected async getPersistedCRDTDoc(
		syncConfig: SyncConfig,
		record: ObjectData,
		expectedVersion: number
	): Promise< CRDTDoc | null > {
		const objectId = syncConfig.getObjectId( record ).toString();
		const objectType = syncConfig.objectType.toString();

		// CRDT persistence is currently only supported for post types.
		if ( ! objectType.startsWith( 'postType/' ) ) {
			return Promise.resolve( null );
		}

		// try {
		// 	const editedRecord = select( coreStore ).getEditedEntityRecord( 'postType', 'post', record.id as number );
		// 	this.logger.debug( 'Fetched edited entity record', { editedRecord } );
		// } catch ( error ) {
		// 	this.logger.error( 'Error getting edited entity record', { error } );
		// }

		const entityMeta = getMetaFromEntityRecord( record );

		// Attempt to load the initial CRDT document from post meta.
		const expectedHash = await getHashForEntityRecord( record );
		const persistedDoc = getPersistedCrdtDocFromEntityMeta(
			entityMeta,
			expectedHash,
			expectedVersion
		);

		// if ( ! persistedDoc ) {
		// 	console.log( record.content );
		// } else {
		// 	const ymap = persistedDoc.getMap( 'document' );
		// 	console.debug( 'Loaded persisted CRDT doc', ymap.toJSON() );
		// }

		const logMessage = persistedDoc
			? 'Found persisted CRDT doc in entity meta'
			: 'Persisted CRDT doc not found in entity meta';
		this.logger.debug( logMessage, {
			objectType,
			objectId,
			persistedDoc,
			version: persistedDoc ? getCrdtDocVersion( persistedDoc ) : null,
		} );

		return Promise.resolve( persistedDoc );
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
