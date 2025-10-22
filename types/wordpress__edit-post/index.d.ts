import type { StoreDescriptor } from '@wordpress/data/build-types/types';

declare module '@wordpress/edit-post' {
	export const store: StoreDescriptor< any >;

	export interface EditPostStoreSelectors {
		getEditorMode(): 'visual' | 'text' | undefined;
	}
}
