export const WEBSOCKET_PROVIDER_MAX_BACKOFF_IN_MS = 15000;
export const WEBSOCKET_URL = getVipConfigFromWindow( 'wsUrl' );

export const BLOG_ID = getVipConfigFromWindow( 'blogId' );

export const COLLABORATOR_LIMIT = getVipConfigFromWindow( 'collaboratorLimit' );
export const COLLABORATOR_LIMIT_TIER = getVipConfigFromWindow( 'collaboratorLimitTier' );
export const CONTACT_AJAX = getVipConfigFromWindow( 'contactAjax' );
export const SUPPORT_EMAIL = getVipConfigFromWindow( 'supportEmail' );

// Exporting this as a function allows for easier testing/mocking.
export function isDevelopment(): boolean {
	return 'development' === process.env.NODE_ENV;
}

function getVipConfigFromWindow< Key extends keyof VIPRTCConfig >(
	key: Key
): VIPRTCConfig[ Key ] | null {
	if ( 'undefined' === typeof window || 'undefined' === typeof window.VIP_RTC ) {
		return null;
	}

	// eslint-disable-next-line security/detect-object-injection
	return window.VIP_RTC[ key ];
}
