import { __ } from '@wordpress/i18n';

import type { ConnectionError } from '@/types/sync';

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

/**
 * Map WordPress REST authorization responses from the token endpoint to the
 * sync error code that Gutenberg uses for its authentication message. Network
 * and other request failures do not have a trustworthy authorization status.
 */
export function getTokenFetchErrorCode( error: unknown ): ConnectionError[ 'code' ] {
	const data = error && typeof error === 'object' && 'data' in error ? error.data : null;
	const status = data && typeof data === 'object' && 'status' in data ? data.status : undefined;

	return status === 401 || status === 403 ? 'authentication-failed' : 'unknown-error';
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
