declare global {
	interface Window {
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
