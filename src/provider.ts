/**
 * Internal dependencies
 */
import { AwarenessManager } from '@/awareness-manager';
import {
	createPersistedCrdtDocMetaRecord,
	getPersistedCrdtDocFromEntityMeta,
	type EntityMetaRecord,
} from '@/utilities/crdt';
import { getHashForEntityRecord, getMetaFromEntityRecord } from '@/utilities/entity';
import { Logger } from '@/utilities/logger';
import { createWebSocketConnection, type WebSocketConnectionConfig } from '@/websocket-client';

import type { CRDTDoc, ObjectData, SyncConfig } from '@wordpress/sync';
import type { WebsocketProvider } from 'y-websocket';

import * as Y from 'yjs';

export class SyncProviderWithAwareness extends window.wp.sync.SyncProvider {
	private logger: Logger = new Logger( 'provider' );

	public constructor( config: WebSocketConnectionConfig ) {
		super( [
			createWebSocketConnection( {
				...config,
				onStatusChange: ( ...args ) => this.onProviderStatusChange( ...args ),
			} ),
		] );
	}

	public async createEntityMeta(
		syncConfig: SyncConfig,
		rawRecord: ObjectData
	): Promise< EntityMetaRecord > {
		if ( ! syncConfig.supports?.crdtPersistence ) {
			return {};
		}

		const objectId = syncConfig.getObjectId( rawRecord ).toString();
		const objectType = syncConfig.objectType.toString();
		const ydoc = this.entityStates.get( this.getEntityId( objectType, objectId ) )?.ydoc;

		if ( ! ydoc || 'auto-draft' === rawRecord.status ) {
			return {};
		}

		const contentHash = await getHashForEntityRecord( rawRecord, syncConfig );
		const entityMeta = createPersistedCrdtDocMetaRecord( ydoc, contentHash );

		const docLength = Y.encodeStateAsUpdate( ydoc ).byteLength;
		console.debug( `[rtc] CRDT doc for ${ objectType }#${ objectId } is ${ docLength } bytes` );

		this.logger.debug( 'Providing updated entity meta to saveEntityRecord', {
			objectType,
			objectId,
			entityMeta,
		} );

		return entityMeta;
	}

	protected async getPersistedCRDTDoc(
		syncConfig: SyncConfig,
		rawRecord: ObjectData
	): Promise< CRDTDoc | null > {
		if ( ! syncConfig.supports?.crdtPersistence ) {
			return Promise.resolve( null );
		}

		const objectId = syncConfig.getObjectId( rawRecord ).toString();
		const objectType = syncConfig.objectType.toString();
		const entityMeta = getMetaFromEntityRecord( rawRecord );

		// Attempt to load the initial CRDT document from post meta.
		const expectedHash = await getHashForEntityRecord( rawRecord, syncConfig );
		const persistedDoc = getPersistedCrdtDocFromEntityMeta( entityMeta, expectedHash );

		const logMessage = persistedDoc
			? 'Found persisted CRDT doc in entity meta'
			: 'Persisted CRDT doc not found in entity meta';
		this.logger.debug( logMessage, {
			objectType,
			objectId,
			persistedDoc,
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
