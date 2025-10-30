export const AWARENESS_CURSOR_UPDATE_DEBOUNCE_IN_MS = 50;
export const LOCAL_CURSOR_UPDATE_DEBOUNCE_IN_MS = 5;

export const DISCONNECTED_THRESHOLD_IN_MS = 5000;
export const REMOVAL_DELAY_IN_MS = 5000;

export const WEBSOCKET_PROVIDER_MAX_BACKOFF_IN_MS = 15000;
export const WEBSOCKET_URL = getVipConfigFromWindow( 'wsUrl' );

export const BLOG_ID = getVipConfigFromWindow( 'blogId' );

/**
 * Settings keys enum matching the settings defined in inc/Settings/Settings.php
 */
export enum SettingKey {
	ENABLE_AWARENESS_AVATARS = 'enable-awareness-avatars',
	ENABLE_AWARENESS_CURSORS = 'enable-awareness-cursors',
	ENABLE_SELF_AWARENESS = 'enable-self-awareness',
	ENABLE_USER_ENTER_NOTIFICATION = 'enable-user-enter-notification',
	ENABLE_USER_EXIT_NOTIFICATION = 'enable-user-exit-notification',
}

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

export function getSettingFromConfig( key: SettingKey ): boolean {
	const settings = getVipConfigFromWindow( 'settings' );
	if ( ! settings ) {
		return false;
	}

	// eslint-disable-next-line security/detect-object-injection
	return settings[ key ] ?? false;
}
