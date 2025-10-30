interface VIPRTCConfig {
	blogId: number;

	// Debugging utilities that are only available in development mode.
	debug: {
		disconnectWebSocket?: () => void;
		reconnectWebSocket?: () => void;
	};

	// Settings from the WordPress options table.
	settings: Record< string, boolean >;

	// The WebSocket URL for the VIP RTC plugin.
	wsUrl: string;
}
