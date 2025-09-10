/**
 * Minimal test setup for mocking window.VIP_RTC
 */

// Setup global window mock for Node.js environment
if ( typeof global !== 'undefined' && typeof window === 'undefined' ) {
	// @ts-expect-error - Setting up global window for testing
	global.window = {};
}

// Mock window.VIP_RTC with minimal required properties
if ( typeof window !== 'undefined' ) {
	window.VIP_RTC = {
		debug: {},
		rtcPostMetaKey: 'vip_rtc_state',
		wsUrl: 'ws://localhost:1234',
		blogId: 1,
	};
}
