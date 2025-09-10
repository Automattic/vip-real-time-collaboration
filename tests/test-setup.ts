/**
 * Minimal test setup for mocking window.VIP_RTC
 *
 * Usage examples:
 *
 * import { setVipRtc, resetVipRtc, getVipRtc } from '../../tests/test-setup';
 *
 * // Set custom values for a test
 * setVipRtc({ blogId: 42, wsUrl: 'wss://custom.test' });
 *
 * // Reset to defaults
 * resetVipRtc();
 *
 * // Get current values
 * const config = getVipRtc();
 * console.log(config.blogId); // 1 (default)
 */

// Default mock values
const DEFAULT_VIP_RTC = {
	debug: {},
	rtcPostMetaKey: 'vip_rtc_state',
	wsUrl: 'ws://localhost:1234',
	blogId: 1,
};

// Setup global window mock for Node.js environment
if ( typeof global !== 'undefined' && typeof window === 'undefined' ) {
	// @ts-expect-error - Setting up global window for testing
	global.window = {
		VIP_RTC: { ...DEFAULT_VIP_RTC },
	};
}

// Mock window.VIP_RTC with minimal required properties
if ( typeof window !== 'undefined' && ! window.VIP_RTC ) {
	window.VIP_RTC = { ...DEFAULT_VIP_RTC };
}

/**
 * Set custom VIP_RTC values for testing
 * @param customValues Partial VIP_RTC values to override
 */
export function setVipRtc( customValues: Partial< typeof DEFAULT_VIP_RTC > ): void {
	const targetWindow = typeof window !== 'undefined' ? window : global.window;
	if ( targetWindow ) {
		targetWindow.VIP_RTC = {
			...targetWindow.VIP_RTC,
			...customValues,
		};
	}
}

/**
 * Reset VIP_RTC to default test values
 */
export function resetVipRtc(): void {
	const targetWindow = typeof window !== 'undefined' ? window : global.window;
	if ( targetWindow ) {
		targetWindow.VIP_RTC = { ...DEFAULT_VIP_RTC };
	}
}

/**
 * Get current VIP_RTC values
 */
export function getVipRtc() {
	const targetWindow = typeof window !== 'undefined' ? window : global.window;
	return targetWindow?.VIP_RTC;
}
