import '@wordpress/notices';
import type { Options } from '@wordpress/notices';

declare module '@wordpress/notices' {
	interface NoticesStoreActions {
		createNotice(
			status: 'info' | 'success' | 'warning' | 'error',
			content: string,
			options?: Options
		): void;
	}
}
