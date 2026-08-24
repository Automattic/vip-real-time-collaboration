declare global {
	interface Window {
		VIP_RTC: VIPRTCConfig;

		// Gutenberg versions before WordPress/gutenberg#81999 expose the
		// editor's Yjs instance on the `wp.sync` global. Newer versions no
		// longer register it and pass Yjs to the provider creator instead.
		wp?: {
			sync?: {
				Y: typeof import('yjs');
			};
		};
	}
}

export {};
