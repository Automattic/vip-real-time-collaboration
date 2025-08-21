/**
 * WordPress dependencies
 */
import { expect, test } from '@wordpress/e2e-test-utils-playwright';

/**
 * Tests the messages displayed by the plugin.
 */
test.describe( 'The plugin should display', () => {
	test.afterEach( async ( { requestUtils } ) => {
		await requestUtils.deleteAllPosts();
	} );

	/**
	 * Verifies that the plugin displays error when Gutenberg is not active.
	 */
	test( 'An error when Gutenberg is not active', async ( { admin } ) => {
		const page = admin.page;
		const errorMessage =
			'The Gutenberg plugin has not been installed. The VIP Real-Time Collaboration plugin has been disabled.';

		await admin.visitAdminPage( '/plugins.php' );

		await page.getByRole( 'link', { name: 'Deactivate Gutenberg' } ).click();
		await expect( page.getByText( errorMessage ) ).toBeVisible();

		await page.getByRole( 'link', { name: 'Activate Gutenberg' } ).click();
		await expect( page.getByText( errorMessage ) ).not.toBeVisible();
	} );

	/**
	 * Verifies that the plugin displays a notice when in the Post Editor.
	 */
	test( 'A notice when in the Post Editor', async ( { admin, page } ) => {
		await admin.createNewPost();

		await expect(
			page.getByLabel( 'Editor content' ).getByText( 'Post lock overridden.' )
		).toBeVisible();
	} );
} );
