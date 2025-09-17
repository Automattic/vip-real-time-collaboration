/**
 * WordPress dependencies
 */
import { expect, test } from '@wordpress/e2e-test-utils-playwright';

/**
 * Tests the messages displayed by the plugin.
 */
test.describe( 'The plugin should display', () => {
	test.beforeAll( async ( { requestUtils } ) => {
		await requestUtils.activatePlugin( 'gutenberg' );
		await requestUtils.activatePlugin( 'vip-real-time-collaboration' );
	} );

	test.afterEach( async ( { requestUtils } ) => {
		await requestUtils.deleteAllPosts();
	} );

	/**
	 * Verifies that the plugin displays error when Gutenberg is not active.
	 */
	test( 'An error when Gutenberg is not active', async ( { admin, requestUtils } ) => {
		const page = admin.page;
		const errorMessage =
			'The Gutenberg plugin has not been installed. The VIP Real-Time Collaboration plugin has been disabled.';

		await admin.visitAdminPage( '/plugins.php' );

		await requestUtils.deactivatePlugin( 'gutenberg' );
		await page.reload();
		await expect( page.getByText( errorMessage ) ).toBeVisible();

		await requestUtils.activatePlugin( 'gutenberg' );
		await page.reload();
		await expect( page.getByText( errorMessage ) ).not.toBeVisible();
	} );
} );
