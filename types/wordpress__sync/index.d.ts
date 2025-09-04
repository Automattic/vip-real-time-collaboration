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
		awareness?: Awareness;
		destroy: () => void;
	}

	type ConnectDoc = ( id: ObjectID, type: ObjectType, ydoc: Y.Doc ) => Promise< ConnectDocResult >;

	// Only include what we actually use from SyncConfig.
	interface SyncConfig {
		getObjectId: ( data: ObjectData ) => ObjectID;
		objectType: ObjectType;
		supports?: {
			awareness?: boolean;
			undo?: boolean;
		};
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
		protected connections: Map< EntityID, ConnectDocResult[] >;
		protected entityStates: Map< EntityID, EntityState >;

		public constructor( connectionCreators: ConnectDoc[] ): void;
		public bootstrap(
			syncConfig: SyncConfig,
			record: ObjectData,
			handlers: RecordHandlers
		): Promise< void >;

		public createEntityMeta(
			syncConfig: SyncConfig,
			record: ObjectData,
			changes: Partial< ObjectData >
		): Promise< Record< string, any > >;

		protected getEntityId( type: ObjectType, id: ObjectID ): EntityID;
		protected getPersistedCRDTDoc(
			syncConfig: SyncConfig,
			record: ObjectData,
			expectedVersion: number
		): Promise< CRDTDoc | null >;
	}
}
