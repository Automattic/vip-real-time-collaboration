import type { ConnectionErrorCode } from '@wordpress/sync';

/**
 * Sync error codes the plugin handles with its own modal. Gutenberg's
 * default modal is suppressed for these via
 * `editor.isSyncConnectionErrorHandled`.
 */
export const CUSTOM_MODAL_ERROR_CODES: ReadonlyArray< ConnectionErrorCode > = [
	'collaborator-limit-exceeded',
	'connection-limit-exceeded',
	'room-connection-limit-exceeded',
];

/**
 * WebSocket close codes that map to `CUSTOM_MODAL_ERROR_CODES`. Used by
 * the websocket client to skip emitting Gutenberg-modal retry-state fields
 * for errors our own modal handles.
 */
export const CUSTOM_MODAL_CLOSE_CODES: ReadonlySet< number > = new Set( [ 4002, 4003 ] );
