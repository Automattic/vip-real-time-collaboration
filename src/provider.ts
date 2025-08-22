/**
 * External dependencies
 */
import { store as blockEditorStore } from '@wordpress/block-editor';
import { dispatch, select, subscribe } from '@wordpress/data';
import { store as editorStore } from '@wordpress/editor';

/**
 * Internal dependencies
 */
import { WPBlockSelection } from '@wordpress/editor/build-types/store/selectors';

import { getCrdtDoc, updateCrdtDoc } from '@/api/crdt';
import { AwarenessManager } from '@/awareness-manager';
import { store as awarenessStore } from '@/store/awareness-store';
import { createWebSocketConnection, type WebSocketConnectionConfig } from '@/websocket-client';

import type {
	CRDTDoc,
	EntityID,
	ObjectData,
	ObjectID,
	ObjectType,
	StackItemEvent,
	SyncConfig,
	UndoManager,
	UndoManagerCallbacks,
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
				await AwarenessManager.bootstrap( entityId, connection.awareness );
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

	private lastUndoItem: StackItemEvent | null = null;

	protected getUndoManagerCallbacks(): UndoManagerCallbacks {
		return {
			onStackItemAdded: ( event: StackItemEvent, _undoManager: UndoManager ) => {
				if ( event.type === 'redo' ) {
					// Don't need to add selection metadata during a redo, only for undo events.
					return;
				}

				this.lastUndoItem = event;

				// // @ts-expect-error - block editor store type issues
				// const { getSelectionStart, getSelectionEnd } = select( blockEditorStore );
				// const selectionStart = getSelectionStart();
				// const selectionEnd = getSelectionEnd();

				// console.log( 'onStackItemAdded, saving selection:', {
				// 	selectionStart,
				// 	selectionEnd,
				// 	event,
				// } );

				// event.stackItem.meta.set( 'selectionStart', selectionStart );
				// event.stackItem.meta.set( 'selectionEnd', selectionEnd );
			},
			onStackItemPopped: ( event: StackItemEvent, _undoManager: UndoManager ) => {
				const { selectionChange } = dispatch( blockEditorStore );

				const selectionStart = event.stackItem.meta.get( 'selectionStart' ) as WPBlockSelection;
				// const selectionEnd = event.stackItem.meta.get( 'selectionEnd' ) as WPBlockSelection;

				// console.log( 'onStackItemPopped, calling selectionChange with:', selectionStart );
				// void selectionChange( selectionStart );

				// if ( selectionStart.clientId === selectionEnd.clientId ) {
				// 	// Restore a selection within a single block.
				// 	console.log( 'onStackItemPopped, restoring selection:', {
				// 		clientId: selectionStart.clientId,
				// 		attributeKey: selectionStart.attributeKey,
				// 		startOffset: selectionEnd.offset,
				// 		endOffset: selectionEnd.offset,
				// 		event,
				// 	} );

				// 	// @ts-expect-error - block editor store type issues
				// 	void selectionChange( {
				// 		clientId: selectionStart.clientId,
				// 		attributeKey: selectionStart.attributeKey,
				// 		startOffset: selectionEnd.offset - 2,
				// 		endOffset: selectionEnd.offset - 2,
				// 	} );
				// } else {
				// 	// If the selection spans multiple blocks, only restore cursor to start position.
				// 	console.log( 'onStackItemPopped over multiple blocks, restoring selection:', {
				// 		selectionStart,
				// 	} );

				// 	// @ts-expect-error - block editor store type issues
				// 	void selectionChange( {
				// 		clientId: selectionStart.clientId,
				// 		attributeKey: selectionStart.attributeKey,
				// 		startOffset: selectionStart.offset,
				// 		endOffset: selectionStart.offset,
				// 	} );
				// }
			},
		};
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
				const { patchUser } = dispatch( awarenessStore );
				void patchUser( provider.awareness.clientID, { isConnected: false } );
				break;
			}

			case 'connected': {
				AwarenessManager.resetAfterDisconnect();
				break;
			}

			case 'disconnected': {
				if ( provider.awareness.clientID ) {
					const { patchUser } = dispatch( awarenessStore );
					void patchUser( provider.awareness.clientID, { isConnected: false } );
				}
				break;
			}
		}
	}
}
