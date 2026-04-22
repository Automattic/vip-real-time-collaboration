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
		| 'collaborator-limit-exceeded'
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

		/**
		 * Milliseconds until the next automatic retry attempt. Surfaced so
		 * Gutenberg's default modal can render a countdown and auto-hide
		 * the modal while a retry is pending.
		 */
		willAutoRetryInMs?: number;

		/**
		 * Whether the provider has exhausted its initial retry schedule and
		 * considers reconnection unlikely in the near term. Gutenberg's
		 * default modal uses this to force itself visible even when a
		 * retry is still pending.
		 */
		backgroundRetriesFailed?: boolean;
	}

	interface ProviderEventMap {
		status: ConnectionStatus;
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
