declare global {
	interface Window {
		VIP_RTC: VIPRTCConfig | undefined;

		wp: {
			sync: {
				Y: typeof import('yjs');
			};
		};
	}
}

export {};
