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
		ydoc: Y.Doc
	) => Promise< ProviderCreatorResult >;

	// Only include what we actually use from SyncConfig.
	interface SyncConfig {
		applyChangesToCRDTDoc: ( ydoc: Y.Doc, changes: Partial< ObjectData > ) => void;
		getChangesFromCRDTDoc: ( ydoc: Y.Doc, editedRecord: ObjectData ) => ObjectData;
		supports?: {
			awareness?: boolean;
			crdtPersistence?: boolean;
			undo?: boolean;
		};
	}

	interface RecordHandlers {
		editRecord: ( data: Partial< ObjectData > ) => void;
		getEditedRecord: () => Promise< ObjectData >;
	}
}
