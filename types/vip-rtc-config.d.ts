interface VIPRTCConfig {
	// The version number of the persistent CRDT document.
	crdtDocVersion: number;

	// Debugging utilities that are only available in development mode.
	debug: {
		deserializeCrdtAsJson?: ( serializedCrdtDoc: string ) => object | null;
		disconnectWebSocket?: () => void;
		reconnectWebSocket?: () => void;
	};

	// The WebSocket URL for the VIP RTC plugin.
	wsUrl: string;
}
