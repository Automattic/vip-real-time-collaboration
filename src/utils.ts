import { __ } from '@wordpress/i18n';

export function getWebSocketUrl(): string | undefined {
	return window.VIP_RTC?.wsUrl;
}

export function getErrorMessage( error: unknown ): string {
	if ( error instanceof Error ) {
		return error.message;
	}

	if (
		error &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message;
	}

	return __( 'Unknown error', 'vip-realtime-collaboration' );
}
