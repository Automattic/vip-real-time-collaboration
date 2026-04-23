interface VIPRTCConfig {
	blogId: number;

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

	// The WebSocket URL for the VIP RTC plugin.
	wsUrl: string;
}
