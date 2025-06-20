/**
 * External dependencies
 */
import type * as Y from 'yjs';
export type ObjectID = string;
export type ObjectType = string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ObjectData = any;

export type ObjectConfig = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	fetch: ( id: ObjectID ) => Promise< ObjectData >;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	applyChangesToDoc: ( ydoc: Y.Doc, data: any ) => void;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	fromCRDTDoc: ( ydoc: Y.Doc ) => any;
};

export type ConnectDoc = ( id: ObjectID, type: ObjectType, ydoc: Y.Doc ) => Promise< () => void >;

export type SyncProvider = {
	register: ( type: ObjectType, config: ObjectConfig ) => void;
	bootstrap: (
		type: ObjectType,
		id: ObjectID,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		handleChanges: ( data: any ) => void
	) => Promise< Y.Doc >;
	encodeState: ( type: ObjectType, id: ObjectID ) => Uint8Array | null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	update: ( type: ObjectType, id: ObjectID, data: any, origin: any ) => void;
	discard: ( type: ObjectType, id: ObjectID ) => Promise< void >;
	postTypeConfigs: { [ postType: string ]: ObjectConfig };
};
