/**
 * External dependencies
 */
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

declare module '@wordpress/sync' {
	type ObjectID = string;
	type ObjectType = string;
	type ObjectData = object;
	type UndoManager = Y.UndoManager;

	type AwarenessClientID = number;

	type AwarenessEventListener = ( params: {
		added: AwarenessClientID[];
		updated: AwarenessClientID[];
		removed: AwarenessClientID[];
	} ) => void;

	type AwarenessStates = Map< AwarenessClientID, Record< string, unknown > >;

	type CRDTDoc = Y.Doc;

	type ConnectDocResult = {
		awareness: Awareness | null;
		destroy: () => void;
	};

	type ConnectDoc = ( id: ObjectID, type: ObjectType, ydoc: Y.Doc ) => Promise< ConnectDocResult >;

	type SyncConfig = {
		applyChangesToDoc: ( ydoc: Y.Doc, data: Partial< ObjectData > ) => void;
		fromCRDTDoc: ( ydoc: Y.Doc ) => ObjectData;
		getObjectId: ( data: ObjectData ) => ObjectID;
		objectType: ObjectType;
		supportsAwareness: boolean;
	};

	type SyncProvider = {
		__fallback?: boolean;
		bootstrap: (
			syncConfig: SyncConfig,
			initialData: ObjectData,
			handleChanges: ( data: Partial< ObjectData > ) => void
		) => Promise< void >;
		configs: Map< ObjectType, SyncConfig >;
		discard: ( type: ObjectType, id: ObjectID ) => void;
		update: (
			type: ObjectType,
			record: ObjectData,
			changes: Partial< ObjectData >,
			origin: string
		) => void;

		awarenessManager?: {
			addListener: ( eventType: 'update' | 'change', listener: AwarenessEventListener ) => void;
			getStates: () => AwarenessStates;
			setLocalState: ( field: string, value: unknown ) => void;
			removeStates: () => void;
		};
	};
}
