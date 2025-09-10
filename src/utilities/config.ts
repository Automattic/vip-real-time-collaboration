export const PERSISTED_STATE_POST_META_KEY = getVipConfigFromWindow( 'rtcPostMetaKey' );

export const AWARENESS_CURSOR_UPDATE_DEBOUNCE_IN_MS = 150;
export const LOCAL_CURSOR_UPDATE_DEBOUNCE_IN_MS = 20;

export const DISCONNECTED_THRESHOLD_IN_MS = 5000;
export const REMOVAL_DELAY_IN_MS = 5000;

export const WEBSOCKET_PROVIDER_MAX_BACKOFF_IN_MS = 15000;
export const WEBSOCKET_URL = getVipConfigFromWindow( 'wsUrl' );

export const BLOG_ID = getVipConfigFromWindow( 'blogId' );

// Exporting this as a function allows for easier testing/mocking.
export function isDevelopment(): boolean {
	return 'development' === process.env.NODE_ENV;
}

function getVipConfigFromWindow< Key extends keyof VIPRTCConfig >( key: Key ): VIPRTCConfig[ Key ] {
	if ( 'undefined' === typeof window || 'undefined' === typeof window.VIP_RTC ) {
		throw new Error( 'window.VIP_RTC is not defined' );
	}

	return window.VIP_RTC[ key ];
}
