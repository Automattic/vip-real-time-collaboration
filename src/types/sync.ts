import type {
	ConnectionStatus as WordPressConnectionStatus,
	ProviderCreatorOptions as WordPressProviderCreatorOptions,
} from '@wordpress/sync';
import type * as YjsModule from 'yjs';

type ConnectedStatus = Exclude< WordPressConnectionStatus, { status: 'disconnected' } >;
type DisconnectedStatus = Extract< WordPressConnectionStatus, { status: 'disconnected' } >;
type WordPressConnectionError = NonNullable< DisconnectedStatus[ 'error' ] >;

/**
 * Error codes added by the VIP WebSocket provider.
 *
 * WordPress Sync exposes its built-in codes as an enum, so the template literal
 * converts those enum members to their string values before adding our provider-
 * specific codes.
 */
export type ConnectionErrorCode =
	| `${ WordPressConnectionError[ 'code' ] }`
	| 'collaborator-limit-exceeded'
	| 'room-connection-limit-exceeded';

export interface ConnectionError extends Error {
	code: ConnectionErrorCode;
}

/**
 * WordPress's canonical connection status with the error field widened only at
 * the provider boundary to allow VIP-specific error codes.
 */
export type ConnectionStatus =
	| ConnectedStatus
	| ( Omit< DisconnectedStatus, 'error' > & { error?: ConnectionError } );

export interface ProviderEventMap {
	status: ConnectionStatus;
}

export type ProviderOn = < K extends keyof ProviderEventMap >(
	event: K,
	callback: ( data: ProviderEventMap[ K ] ) => void
) => void;

export interface ProviderCreatorResult {
	destroy: () => void;
	on: ProviderOn;
}

/**
 * WordPress's provider creator options widened with the `Y` option added in
 * WordPress/gutenberg#81999. Newer Gutenberg versions pass the editor's Yjs
 * module here. Older versions expose it as the `wp.sync.Y` global instead, so
 * the option stays optional. This local widening can be removed once the
 * installed `@wordpress/sync` types include `Y`.
 */
export type ProviderCreatorOptions = WordPressProviderCreatorOptions & {
	Y?: typeof YjsModule;
};

export type ProviderCreator = (
	options: ProviderCreatorOptions
) => Promise< ProviderCreatorResult >;
