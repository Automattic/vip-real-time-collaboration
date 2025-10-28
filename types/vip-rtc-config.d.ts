interface VIPRTCConfig {
	blogId: number;

	// Debugging utilities that are only available in development mode.
	debug: {
		disconnectWebSocket?: () => void;
		reconnectWebSocket?: () => void;
	};

	// The WebSocket URL for the VIP RTC plugin.
	wsUrl: string;
}
