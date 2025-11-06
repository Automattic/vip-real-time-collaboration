declare global {
	interface Window {
		VIP_RTC: VIPRTCConfig;

		wp: {
			sync: {
				Y: typeof import('yjs');
			};
		};
	}
}

export {};
