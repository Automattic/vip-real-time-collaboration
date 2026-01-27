/**
 * Type declarations for @wordpress/sync.
 *
 * The npm-published version of @wordpress/sync (1.32.0) has a different API
 * than the local Gutenberg version. This file provides the types needed
 * for the local development environment.
 */
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

declare module '@wordpress/sync' {
	// Re-export Yjs
	export { Y };

	// Basic types
	export type ObjectID = string;
	export type ObjectType = string;
	export type AwarenessState = Awareness;

	// Connection types
	export type SyncConnectionStatus = 'connected' | 'connecting' | 'disconnected';

	export interface SyncConnectionError {
		code: string;
		message?: string;
		description?: string;
	}

	export interface SyncConnectionState {
		status: SyncConnectionStatus;
		error?: SyncConnectionError;
	}

	// Provider types
	export interface ProviderEventMap {
		status: SyncConnectionState;
	}

	export type ProviderOn = < K extends keyof ProviderEventMap >(
		event: K,
		callback: ( data: ProviderEventMap[ K ] ) => void
	) => void;

	export interface ProviderCreatorOptions {
		awareness?: AwarenessState;
		objectType: ObjectType;
		objectId: ObjectID | null;
		ydoc: Y.Doc;
	}

	export interface ProviderCreatorResult {
		destroy: () => void;
		on: ProviderOn;
	}

	export type ProviderCreator = ( options: ProviderCreatorOptions ) => Promise< ProviderCreatorResult >;

	// Config constants
	export const CRDT_RECORD_MAP_KEY: string;
	export const CRDT_RECORD_METADATA_MAP_KEY: string;
	export const CRDT_RECORD_METADATA_SAVED_AT_KEY: string;
	export const CRDT_RECORD_METADATA_SAVED_BY_KEY: string;

	/**
	 * An enhanced state includes additional metadata about the user's connection
	 * that is not appropriate to synchronize via Yjs awareness.
	 */
	export type EnhancedState< State > = State & {
		clientId: number;
		isConnected: boolean;
		isMe: boolean;
	};
}
