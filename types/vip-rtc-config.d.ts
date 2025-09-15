interface VIPRTCConfig {
	// Debugging utilities that are only available in development mode.
	debug: {
		deserializeCrdtAsJson?: ( serializedCrdtDoc: string ) => object | null;
		disconnectWebSocket?: () => void;
		reconnectWebSocket?: () => void;
	};

	// The post meta key where state is persisted, including the CRDT document.
	rtcPostMetaKey: string;

	// The WebSocket URL for the VIP RTC plugin.
	wsUrl: string;

	blogId: number;
}
