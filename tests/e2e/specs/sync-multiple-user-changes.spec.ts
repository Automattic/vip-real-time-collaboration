/**
 * WordPress dependencies
 */
import { expect, test } from '@wordpress/e2e-test-utils-playwright';

test.describe( 'Simple changes by multiple users', () => {
	/**
	 * Tests syncing changes in the same browser.
	 */
	test.describe( 'in the same browser', () => {
		test.beforeEach( async ( { admin } ) => {
			await admin.createNewPost();
		} );

		test.afterEach( async ( { requestUtils } ) => {
			await requestUtils.deleteAllPosts();
		} );

		/**
		 * Verifies that 4 paragraph blocks are synced
		 */
		test( '4 paragraph blocks', async ( { admin, editor, page } ) => {
			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await page.waitForTimeout( 250 );

			// Enter a title
			await page.keyboard.type( 'Post 1' );

			await page.keyboard.press( 'Enter' );

			// Save this draft
			await editor.saveDraft();

			// Get the post's URL so another session can be opened
			const postUrl = page.url();

			// Store the old context for comparison
			const oldContext = admin.context;

			// Open another browser context, within Chromium itself
			const newContext = await admin.browser.newContext();

			// Open a new page within the new context
			const existingPostPage = await newContext.newPage();

			// Go to the newly created post
			await existingPostPage.goto( postUrl );

			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await existingPostPage.waitForTimeout( 250 );

			// This allows for a consistent focus in the second session, without needing to be concerned with Gutenberg not automatically doing this.
			const emptyParagraph = existingPostPage
				.frameLocator( '[name="editor-canvas"]' )
				.locator( '[data-type="core/paragraph"][data-empty="true"]' );
			await emptyParagraph.click();

			await existingPostPage.keyboard.press( 'Enter' );

			await existingPostPage.keyboard.type( 'This is a paragraph.' );

			await existingPostPage.keyboard.press( 'Enter' );

			// Insert another block in the original page
			await editor.insertBlock( {
				name: 'core/paragraph',
				attributes: { content: 'This is another paragraph.' },
			} );

			// Get the updated HTML from the new page
			const editedPostContent = await existingPostPage.evaluate( () =>
				// @ts-ignore - TypeScript is not aware of the wp global. Not worth adding that support in just for tests
				window.wp.data.select( 'core/editor' ).getEditedPostContent()
			);

			// Ensure the contexts are different
			expect( oldContext === newContext ).toBeFalsy();

			// Ensure the new page contains the changes from the old page
			expect( editedPostContent ).toEqual(
				'<!-- wp:paragraph -->\n<p></p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p>This is a paragraph.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p></p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p>This is another paragraph.</p>\n<!-- /wp:paragraph -->'
			);

			// Close the new context and pages
			await existingPostPage.close();
			await newContext.close();
		} );
	} );
} );
