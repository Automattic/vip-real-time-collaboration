/**
 * WordPress dependencies
 */
import type { PrivateApis } from '@wordpress/private-apis';

/**
 * External dependencies
 */
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

declare module '@wordpress/sync' {
	export type ObjectID = string;
	export type ObjectType = string;

	export type AwarenessState = Awareness;

	export type SyncConnectionStatus = 'connected' | 'connecting' | 'disconnected';

	// Re-export Y namespace for type annotations
	export type { Y };

	// CRDT config constants
	export const CRDT_RECORD_MAP_KEY: string;
	export const CRDT_RECORD_METADATA_MAP_KEY: string;
	export const CRDT_RECORD_METADATA_SAVED_AT_KEY: string;
	export const CRDT_RECORD_METADATA_SAVED_BY_KEY: string;

	// Delta class type (quill-delta)
	export class Delta {
		constructor( ops?: unknown[] );
		ops: unknown[];
		diffWithCursor( other: Delta, cursor: number | null ): { ops: unknown[] };
	}

	export interface SyncConnectionError {
		code: string;
		message?: string;
		description?: string;
	}

	export interface SyncConnectionState {
		status: SyncConnectionStatus;
		error?: SyncConnectionError;
	}

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

	export interface SyncPrivateApis {
		Y: typeof Y;
		Delta: typeof Delta;
		CRDT_RECORD_MAP_KEY: string;
		CRDT_RECORD_METADATA_MAP_KEY: string;
		CRDT_RECORD_METADATA_SAVED_AT_KEY: string;
		CRDT_RECORD_METADATA_SAVED_BY_KEY: string;
		LOCAL_EDITOR_ORIGIN: string;
		LOCAL_SYNC_MANAGER_ORIGIN: string;
		WORDPRESS_META_KEY_FOR_CRDT_DOC_PERSISTENCE: string;
		createSyncManager: ( options: CreateSyncManagerOptions ) => SyncManager;
	}

	export const privateApis: PrivateApis< SyncPrivateApis >;
}
