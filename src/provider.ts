/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import { getCrdtDoc, updateCrdtDoc } from './api/crdt';
import { AwarenessManager } from './awareness-manager';
import { SelectionState } from './hooks/use-render-cursors';
import { UserState } from './store/awareness-store';

import type {
	AwarenessStateChangeCallback,
	AwarenessReadyCallback,
	ConnectDocResult,
	CRDTDoc,
	ObjectData,
	ObjectID,
	ObjectType,
	SyncConfig,
} from '@wordpress/sync';

export class SyncProviderWithAwareness extends window.wp.sync.SyncProvider {
	private awarenessManager = new AwarenessManager();

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

		connections.forEach( ( connection: ConnectDocResult ) => {
			if ( connection.awareness && syncConfig.supportsAwareness ) {
				this.awarenessManager.bootstrap( entityId, connection.awareness );
			}
		} );
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

	public async persistCrdtDoc( objectType: ObjectType, objectId: ObjectID ): Promise< void > {
		const crdtDoc = this.getEntityState( objectType, objectId )?.ydoc;

		if ( ! crdtDoc ) {
			throw new Error( `CRDT document not found for ${ objectType } with ID ${ objectId }` );
		}

		await updateCrdtDoc( objectType, objectId, crdtDoc, false );
	}

	public getUserStateById(
		objectType: ObjectType,
		objectId: ObjectID,
		awarenessClientId: number
	): UserState | null {
		return (
			this.awarenessManager
				.getAllStates( this.getEntityId( objectType, objectId ) )
				.get( awarenessClientId )?.userState ?? null
		);
	}

	public resetAwareness( objectType: ObjectType, objectId: ObjectID ): void {
		return this.awarenessManager.removeAllStates( this.getEntityId( objectType, objectId ) );
	}

	public setUserSelection(
		objectType: ObjectType,
		objectId: ObjectID,
		selection: SelectionState
	): void {
		const entityId = this.getEntityId( objectType, objectId );
		const userState = this.awarenessManager.getLocalState< 'userState' >( entityId, 'userState' );

		if ( userState ) {
			this.awarenessManager.setLocalState< 'userState' >( entityId, 'userState', {
				...userState,
				editorState: {
					...userState.editorState,
					selection,
				},
			} );
		}
	}

	public setUserState( objectType: ObjectType, objectId: ObjectID, userState: UserState ): void {
		this.awarenessManager.setLocalState< 'userState' >(
			this.getEntityId( objectType, objectId ),
			'userState',
			userState
		);
	}

	public addAwarenessListener(
		objectType: ObjectType,
		objectId: ObjectID,
		eventType: 'change' | 'update',
		listener: AwarenessStateChangeCallback
	): void {
		this.awarenessManager.addListener(
			this.getEntityId( objectType, objectId ),
			eventType,
			listener
		);
	}

	public onAwarenessReady(
		objectType: ObjectType,
		objectId: ObjectID,
		listener: AwarenessReadyCallback
	): void {
		this.awarenessManager.addOnReadyListener( this.getEntityId( objectType, objectId ), listener );
	}
}
