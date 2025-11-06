declare module '@wordpress/edit-post' {
	import type { StoreDescriptor } from '@wordpress/data';

	export const store: StoreDescriptor;

	export interface EditPostStoreSelectors {
		getEditorMode(): 'visual' | 'text' | undefined;
	}
}
