declare global {
	interface Window {
		VIP_RTC: VIPRTCConfig;

		wp: {
			// ToDo: This is currently due to e2e test. I'm not sure if we will keep that line, so I've left this as any for now.
			data: any;
			sync: {
				SyncProvider: typeof import('@wordpress/sync').SyncProvider;
				Y: typeof import('yjs');
			};
		};
	}
}

export {};
