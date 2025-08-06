declare global {
	interface Window {
		VIP_RTC: VIPRTCConfig | undefined;

		wp: {
			sync: {
				SyncProvider: typeof import('@wordpress/sync').SyncProvider;
				Y: typeof import('yjs');
			};
		};
	}
}

export {};
