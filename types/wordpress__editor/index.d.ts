import '@wordpress/editor';
import type { PrivateApis } from '@wordpress/private-apis';

declare module '@wordpress/editor' {
	interface EditorStoreSelectors {
		getCurrentPostId(): number | null;
		getCurrentPostType(): string | null;
		getEditedPostContent(): string | null;
	}

	export interface EditorPrivateApis {
		EditorPresence: React.FC< React.PropsWithChildren >;
		CollaborationMode: React.FC< React.PropsWithChildren >;
	}

	export const privateApis: PrivateApis< EditorPrivateApis >;
}
