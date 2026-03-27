declare module 'y-websocket' {
	interface WebsocketProviderOptions {
		connect?: boolean;
		params?: Record< string, string >;
		protocols?: string[];
		resyncInterval?: number;
		maxBackoffTime?: number;
		disableBc?: boolean;
	}
}
