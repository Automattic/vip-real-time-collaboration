interface VIPRTCConfig {
	// The version number of the persistent CRDT document.
	crdtDocVersion: number;

	// The WebSocket URL for the VIP RTC plugin.
	wsUrl: string;
}
