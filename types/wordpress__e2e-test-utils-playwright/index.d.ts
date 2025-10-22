declare module '@wordpress/e2e-test-utils-playwright' {
	import type { Browser, Page, BrowserContext } from '@playwright/test';
	import { expect as playwrightExpect } from '@playwright/test';

	export class Admin {
		page: Page;
		context: BrowserContext;
		browser: Browser;
		pageUtils: PageUtils;
		editor: Editor;
		createNewPost( options?: Record< string, unknown > ): Promise< void >;
		editPost( postId: number ): Promise< void >;
		visitAdminPage( path: string ): Promise< void >;
	}

	export class Editor {
		page: Page;
		browser: Browser;
		context: BrowserContext;
		insertBlock( block: Record< string, unknown > ): Promise< void >;
		saveDraft(): Promise< void >;
		publishPost(): Promise< void >;
		getEditedPostContent(): Promise< string >;
	}

	export class PageUtils {
		page: Page;
	}

	export class RequestUtils {
		activatePlugin( slug: string ): Promise< void >;
		deactivatePlugin( slug: string ): Promise< void >;
		deleteAllPosts(): Promise< void >;
		deleteAllPages(): Promise< void >;
		deleteAllComments(): Promise< void >;
	}

	export const test: import('@playwright/test').TestType<
		import('@playwright/test').PlaywrightTestArgs &
			import('@playwright/test').PlaywrightTestOptions & {
				admin: Admin;
				editor: Editor;
				pageUtils: PageUtils;
			},
		import('@playwright/test').PlaywrightWorkerArgs &
			import('@playwright/test').PlaywrightWorkerOptions & {
				requestUtils: RequestUtils;
			}
	>;

	export const expect: typeof playwrightExpect;
}
