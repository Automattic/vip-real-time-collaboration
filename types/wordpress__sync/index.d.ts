/**
 * External dependencies
 */
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

declare module '@wordpress/sync' {
	type CRDTDoc = Y.Doc;
	type EntityID = string;
	type ObjectID = string;
	type ObjectType = string;
	type UndoManager = Y.UndoManager;

	interface ObjectData extends Record< string, unknown > {
		meta?: Record< string, unknown >;
		status?: string;
	}

	interface ConnectDocResult {
		awareness?: Awareness;
		destroy: () => void;
	}

	type ConnectDoc = ( id: ObjectID, type: ObjectType, ydoc: Y.Doc ) => Promise< ConnectDocResult >;

	interface SyncConfig {
		applyChangesToDoc: ( ydoc: Y.Doc, data: Partial< ObjectData > ) => void;
		fromCRDTDoc: ( ydoc: Y.Doc ) => ObjectData;
		getObjectId: ( data: ObjectData ) => ObjectID;
		objectType: ObjectType;
		supportsAwareness?: boolean;
	}

	interface EntityState {
		destroy: () => void;
		ydoc: CRDTDoc;
	}

	class SyncProvider {
		protected connections: Map< EntityID, ConnectDocResult[] >;

		public constructor( connectLocal: ConnectDoc | null, connectRemote: ConnectDoc | null ): void;
		public bootstrap(
			syncConfig: SyncConfig,
			record: ObjectData,
			handleChanges: ( data: Partial< ObjectData > ) => void
		): Promise< void >;
		public configs: Map< ObjectType, SyncConfig >;
		public discard( type: ObjectType, id: ObjectID ): void;
		public update(
			type: ObjectType,
			record: ObjectData,
			changes: Partial< ObjectData >,
			origin: string
		): void;

		public createEntityMeta(
			syncConfig: SyncConfig,
			record: ObjectData,
			changes: Partial< ObjectData >
		): Promise< Record< string, any > >;

		protected getEntityId( type: ObjectType, id: ObjectID ): EntityID;
		protected getEntityState( type: ObjectType, id: ObjectID ): EntityState | null;
		protected getInitialCRDTDoc( syncConfig: SyncConfig, record: ObjectData ): Promise< CRDTDoc >;
		protected getPersistedCRDTDoc(
			syncConfig: SyncConfig,
			record: ObjectData
		): Promise< CRDTDoc | null >;
	}
}

export {};
