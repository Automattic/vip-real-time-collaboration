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
