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

	type AwarenessState = Awareness;

	type SyncConnectionStatus = 'connected' | 'connecting' | 'disconnected';

	interface SyncConnectionError {
		code: string;
		message?: string;
		description?: string;
	}

	interface SyncConnectionState {
		status: SyncConnectionStatus;
		error?: SyncConnectionError;
	}

	interface ProviderEventMap {
		status: SyncConnectionState;
	}

	type ProviderOn = < K extends keyof ProviderEventMap >(
		event: K,
		callback: ( data: ProviderEventMap[ K ] ) => void
	) => void;

	interface ProviderCreatorOptions {
		awareness?: AwarenessState;
		objectType: ObjectType;
		objectId: ObjectID | null;
		ydoc: Y.Doc;
	}

	interface ProviderCreatorResult {
		destroy: () => void;
		on: ProviderOn;
	}

	type ProviderCreator = ( options: ProviderCreatorOptions ) => Promise< ProviderCreatorResult >;

	/**
	 * An enhanced state includes additional metadata about the user's connection
	 * that is not appropriate to synchronize via Yjs awareness.
	 */
	type EnhancedState< State > = State & {
		clientId: number;
		isConnected: boolean;
		isMe: boolean;
	};
}
