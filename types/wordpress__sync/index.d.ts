/**
 * External dependencies
 */
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

declare module '@wordpress/sync' {
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
}
