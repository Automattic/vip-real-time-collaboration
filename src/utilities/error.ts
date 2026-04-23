import { __ } from '@wordpress/i18n';

import type { ConnectionError } from '@wordpress/sync';

/**
 * True when the REST error is `permission_denied` from token generation (entity not syncable),
 * matching "skip this room" handling in Gutenberg's sync providers.
 *
 * See: https://github.com/WordPress/gutenberg/pull/77242
 */
export function isForbiddenAuthError( error: unknown ): boolean {
	if ( ! error || typeof error !== 'object' ) {
		return false;
	}

	return ( error as { code?: unknown } ).code === 'permission_denied';
}

export function getErrorMessage( error: unknown, defaultMessage?: string ): string {
	if ( error instanceof Error ) {
		return error.message;
	}

	// First look for a .data.error string (as returned by the REST API).
	if (
		error &&
		typeof error === 'object' &&
		'data' in error &&
		error.data &&
		typeof error.data === 'object' &&
		'error' in error.data
	) {
		return getErrorMessage( error.data.error, defaultMessage );
	}

	// Next look for an error-like object with a message string.
	if (
		error &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message;
	}

	return defaultMessage ?? __( 'Unknown error', 'vip-real-time-collaboration' );
}

export class WebSocketError extends Error implements ConnectionError {
	public name = 'WebSocketError';

	constructor(
		public code: ConnectionError[ 'code' ],
		message?: string
	) {
		super( message );
	}
}
