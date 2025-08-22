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

	interface AwarenessStateChange {
		added: AwarenessClientID[];
		updated: AwarenessClientID[];
		removed: AwarenessClientID[];
	}

	type AwarenessStateChangeCallback = ( changes: AwarenessStateChange ) => void;
	type AwarenessReadyCallback = () => void;

	type CRDTDoc = Y.Doc;

	type ConnectDocResult = {
		awareness?: Awareness;
		destroy: () => void;
	};

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

	interface StackItem {
		meta: Map< string, unknown >;
	}

	interface StackItemEvent {
		stackItem: StackItem;
		origin: string;
		type: 'undo' | 'redo';
		changedParentTypes: Map<
			Y.AbstractType< Y.YEvent< any > >,
			Array< Y.YEvent< any > >
		>;
	}

	interface UndoManagerCallbacks {
		onStackItemAdded?: (
			event: StackItemEvent,
			undoManager: Y.UndoManager
		) => void;
		onStackItemUpdated?: (
			event: StackItemEvent,
			undoManager: Y.UndoManager
		) => void;
		onStackItemPopped?: (
			event: StackItemEvent,
			undoManager: Y.UndoManager
		) => void;
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
		protected getEntityId( type: ObjectType, id: ObjectID ): EntityID;
		protected getEntityState( type: ObjectType, id: ObjectID ): EntityState | null;
		protected getInitialCRDTDoc( syncConfig: SyncConfig, record: ObjectData ): Promise< CRDTDoc >;
		protected getUndoManagerCallbacks(): UndoManagerCallbacks;
		public update(
			type: ObjectType,
			record: ObjectData,
			changes: Partial< ObjectData >,
			origin: string
		): void;
	}
}

export {};
