declare global {
	interface Window {
		DISCONNECT_WEB_SOCKET?: () => void;

		VIP_RTC: VIPRTCConfig;

		wp: {
			sync: {
				SyncProvider: typeof import('@wordpress/sync').SyncProvider;
				Y: typeof import('yjs');
			};
		};
	}
}

export {};
