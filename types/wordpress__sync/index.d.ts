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

	interface ObjectData extends Record< string, unknown > {}

	interface ProviderCreatorResult {
		destroy: () => void;
	}

	type ProviderCreator = (
		objectType: ObjectType,
		objectId: ObjectID,
		ydoc: Y.Doc,
		awareness?: Awareness
	) => Promise< ProviderCreatorResult >;

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
		ydoc: CRDTDoc;
	}

	interface RecordHandlers {
		editRecord: ( data: Partial< ObjectData > ) => void;
		getEditedRecord: () => Promise< ObjectData >;
		refetchPersistedRecord: () => void;
	}
}
