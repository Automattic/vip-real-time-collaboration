/**
 * WordPress dependencies
 */
import {
	expect,
	test,
} from '@wordpress/e2e-test-utils-playwright';

/**
 * Tests the messages displayed by the plugin.
 */
test.describe( 'The plugin displays', () => {
	/**
	 * Verifies that the plugin displays error when Gutenberg is not active.
	 */
	test( 'An error when Gutenberg is not active', async ( { admin } ) => {
		const page = admin.page;
		const errorMessage = 'The Gutenberg plugin has not been installed. The VIP Realtime Collaboration plugin has been disabled.';

		await admin.visitAdminPage( '/plugins.php' );

		await page.getByRole( 'link', { name: 'Deactivate Gutenberg' } ).click();
		await expect( page.getByText( errorMessage ) ).toBeVisible();

		await page.getByRole( 'link', { name: 'Activate Gutenberg' } ).click();
		await expect( page.getByText( errorMessage ) ).not.toBeVisible();
	} );

	/**
	 * Verifies that the plugin displays a notice when in the Post Editor.
	 */
	test( 'A notice when in the Post Editor', async ( { admin } ) => {
		const page = admin.page;

		await admin.visitAdminPage( 'post.php?post=1&action=edit' );

		await expect(
			page.getByLabel( 'Editor content' ).getByText( 'Post lock overridden.' )
		).toBeVisible();
	} );
} );
