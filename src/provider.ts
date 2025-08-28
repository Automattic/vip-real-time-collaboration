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
import { getMetaFromEntityRecord, getRawContentFromEntityRecord } from '@/utilities/entity';
import { Logger } from '@/utilities/logger';
import { createWebSocketConnection, type WebSocketConnectionConfig } from '@/websocket-client';

import type { CRDTDoc, ObjectData, SyncConfig } from '@wordpress/sync';
import type { WebsocketProvider } from 'y-websocket';

export class SyncProviderWithAwareness extends window.wp.sync.SyncProvider {
	private logger: Logger = new Logger( 'provider' );

	public constructor( config: WebSocketConnectionConfig ) {
		// There is no local persistence, so we pass `null` for the first argument.
		super(
			null,
			createWebSocketConnection( {
				...config,
				onStatusChange: ( ...args ) => this.onProviderStatusChange( ...args ),
			} )
		);
	}

	public async bootstrap(
		syncConfig: SyncConfig,
		record: ObjectData,
		handleChanges: ( data: Partial< ObjectData > ) => void
	): Promise< void > {
		await super.bootstrap( syncConfig, record, handleChanges );

		const objectId = syncConfig.getObjectId( record ).toString();
		const objectType = syncConfig.objectType.toString();
		const entityId = this.getEntityId( objectType, objectId );

		this.logger.debug( 'Bootstrapping entity', { objectType, objectId } );

		const connections = this.connections.get( entityId ) ?? [];

		for ( const connection of connections ) {
			if ( connection.awareness && syncConfig.supportsAwareness ) {
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

		const ydoc = this.getEntityState( objectType, objectId )?.ydoc;
		const rawContent = getRawContentFromEntityRecord( changes );

		if ( ! ydoc || ! rawContent || 'auto-draft' === record.status ) {
			return {};
		}

		const entityMeta = await createPersistedCrdtDocMetaRecord( ydoc, rawContent );

		this.logger.debug( 'Providing updated entity meta to saveEntityRecord', {
			objectType,
			objectId,
			entityMeta,
		} );

		return entityMeta;
	}

	protected getPersistedCRDTDoc(
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

		const entityMeta = getMetaFromEntityRecord( record );

		// Attempt to load the initial CRDT document from post meta.
		const persistedDoc = getPersistedCrdtDocFromEntityMeta( entityMeta, expectedVersion );

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
