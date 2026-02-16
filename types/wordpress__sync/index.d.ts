/**
 * External dependencies
 */
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

declare module '@wordpress/sync' {
	type ObjectID = string;
	type ObjectType = string;

	type ConnectionErrorCode =
		| 'authentication-error'
		| 'connection-expired'
		| 'connection-limit-exceeded'
		| 'unknown-error';

	interface ConnectionError extends Error {
		/**
		 * Error code identifier for programmatic handling and default message lookup.
		 */
		code: ConnectionErrorCode;
	}

	interface ConnectionStatus {
		status: 'connected' | 'connecting' | 'disconnected';

		/**
		 * Optional error information when status is 'disconnected'.
		 */
		error?: ConnectionError;
	}

	interface ProviderEventMap {
		status: SyncConnectionState;
	}

	type ProviderOn = < K extends keyof ProviderEventMap >(
		event: K,
		callback: ( data: ProviderEventMap[ K ] ) => void
	) => void;

	interface ProviderCreatorOptions {
		awareness?: Awareness;
		objectType: ObjectType;
		objectId: ObjectID | null;
		ydoc: Y.Doc;
	}

	interface ProviderCreatorResult {
		destroy: () => void;
		on: ProviderOn;
	}

	type ProviderCreator = ( options: ProviderCreatorOptions ) => Promise< ProviderCreatorResult >;
}
