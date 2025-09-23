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

	interface ObjectData extends Record< string, unknown > {}

	interface ConnectDocResult {
		destroy: () => void;
	}

	type ConnectDoc = (
		id: ObjectID,
		type: ObjectType,
		ydoc: Y.Doc,
		awareness?: Awareness
	) => Promise< ConnectDocResult >;

	// Only include what we actually use from SyncConfig.
	interface SyncConfig {
		getInitialObjectData: ( rawRecord: ObjectData ) => ObjectData;
		getObjectId: ( data: ObjectData ) => ObjectID;
		objectType: ObjectType;
		supports?: {
			awareness?: boolean;
			crdtPersistence?: boolean;
			undo?: boolean;
		};
		syncedProperties: Set< string >;
	}

	interface EntityState {
		discard: () => void;
		handlers: RecordHandlers;
		lastPersistedAt: number;
		syncConfig: SyncConfig;
		undoManager?: UndoManager;
		ydoc: CRDTDoc;
	}

	interface RecordHandlers {
		editRecord: ( data: Partial< ObjectData > ) => void;
		getEditedRecord: () => Promise< ObjectData >;
		refetchPersistedRecord: () => void;
	}

	class SyncProvider {
		protected entityStates: Map< EntityID, EntityState >;

		public constructor( connectionCreators: ConnectDoc[] ): void;
		public bootstrap(
			syncConfig: SyncConfig,
			rawRecord: ObjectData,
			handlers: RecordHandlers
		): Promise< void >;

		public createEntityMeta(
			syncConfig: SyncConfig,
			rawRecord: ObjectData
		): Promise< Record< string, any > >;

		protected getEntityId( type: ObjectType, id: ObjectID ): EntityID;
		protected getPersistedCRDTDoc(
			syncConfig: SyncConfig,
			rawRecord: ObjectData
		): Promise< CRDTDoc | null >;
	}
}
