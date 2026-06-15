interface VIPRTCConfig {
	blogId: number;

	// Endpoint + nonce for the vip-dashboard contact form handler. `null` when
	// the handler isn't available (e.g. mu-plugins not loaded) — JS falls back
	// to a mailto: link in that case.
	contactAjax: {
		url: string;
		nonce: string;
	} | null;

	// Subset of the current user's WordPress capabilities the plugin needs
	// client-side. Evaluated server-side via `current_user_can()` and passed
	// via the inline script so it's available synchronously at render time.
	capabilities: {
		manage_options?: boolean;
	};

	// Debugging utilities that are only available in development mode.
	debug: {
		disconnectWebSocket?: () => void;
		reconnectWebSocket?: () => void;
	};

	// Email used by the mailto: fallback when contactAjax is unavailable.
	supportEmail: string;

	// The WebSocket URL for the VIP RTC plugin.
	wsUrl: string;
}
