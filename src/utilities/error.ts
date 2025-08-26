import { __ } from '@wordpress/i18n';

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
