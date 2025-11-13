export const AWARENESS_CURSOR_UPDATE_DEBOUNCE_IN_MS = 50;
export const LOCAL_CURSOR_UPDATE_DEBOUNCE_IN_MS = 5;

export const DISCONNECTED_THRESHOLD_IN_MS = 5000;
export const REMOVAL_DELAY_IN_MS = 5000;

export const WEBSOCKET_PROVIDER_MAX_BACKOFF_IN_MS = 15000;
export const WEBSOCKET_URL = getVipConfigFromWindow( 'wsUrl' );

export const BLOG_ID = getVipConfigFromWindow( 'blogId' );

// Feature Flags
// Feature: Elected Modes
export const ENABLE_ELECTED_MODES = 'development' === process.env.NODE_ENV;

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
