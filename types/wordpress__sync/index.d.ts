/**
 * External dependencies
 */
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

declare module '@wordpress/sync' {
	type EntityID = string;
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

	type AwarenessStates = Map< AwarenessClientID, Record< string, any > >;

	type CRDTDoc = Y.Doc;

	type ConnectDocResult = {
		awareness?: Awareness;
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

	class SyncProvider {
		protected connections: Map< EntityID, ConnectDocResult >;

		public constructor( connectLocal: ConnectDoc | null, connectRemote: ConnectDoc | null ): void;
		public bootstrap(
			syncConfig: SyncConfig,
			initialData: ObjectData,
			handleChanges: ( data: Partial< ObjectData > ) => void
		): Promise< void >;
		public configs: Map< ObjectType, SyncConfig >;
		public discard( type: ObjectType, id: ObjectID ): void;
		protected getEntityId( type: ObjectType, id: ObjectID ): EntityID;
		public update(
			type: ObjectType,
			record: ObjectData,
			changes: Partial< ObjectData >,
			origin: string
		): void;
	}
}

export {};
