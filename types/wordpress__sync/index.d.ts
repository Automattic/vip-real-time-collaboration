/**
 * External dependencies
 */
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

declare module '@wordpress/sync' {
	type ObjectID = string;
	type ObjectType = string;

	const CRDT_RECORD_MAP_KEY: string;
	const CRDT_RECORD_METADATA_MAP_KEY: string;
	const CRDT_RECORD_METADATA_SAVED_AT_KEY: string;
	const CRDT_RECORD_METADATA_SAVED_BY_KEY: string;

	interface ProviderCreatorResult {
		destroy: () => void;
	}

	type ProviderCreator = (
		objectType: ObjectType,
		objectId: ObjectID,
		ydoc: Y.Doc,
		awareness?: Awareness
	) => Promise< ProviderCreatorResult >;

	function setConnectionStatus(
		objectType: ObjectType,
		objectId: ObjectID | null,
		isConnected: boolean
	): void;
}
