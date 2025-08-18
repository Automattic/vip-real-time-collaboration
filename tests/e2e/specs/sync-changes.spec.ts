/**
 * WordPress dependencies
 */
import { InnerBlocks } from '@wordpress/block-editor';
import { expect, test } from '@wordpress/e2e-test-utils-playwright';

/**
 * Tests the sync changes functionality of the plugin.
 */
test.describe( 'The plugin should sync changes between multiple browser sesssions', () => {
	test.beforeEach( async ( { admin } ) => {
		await admin.createNewPost();
	} );

	test.afterEach( async ( { requestUtils } ) => {
		await requestUtils.deleteAllPosts();
	} );

	/**
	 * Verifies that the plugin sync changes between browser sessions
	 */
	test( 'A user makes changes in the same browser, but different sessions', async ( {
		admin,
		editor,
		page,
	} ) => {
		// Enter a title
		await page.keyboard.type( 'Post 1' );

		// Insert a starting paragraph
		await editor.insertBlock( {
			name: 'core/paragraph',
			attributes: { content: 'This is a paragraph.' },
		} );

		// Save this draft
		await editor.saveDraft();

		// Get the post's URL so another session can be opened
		const postUrl = page.url();

		// Store the old context for cleanup
		const oldContext = admin.context;

		// Open another browser context, within Chromium itself
		const newContext = await admin.browser.newContext();

		// Open a new page within the new context
		const existingPostPage = await newContext.newPage();

		// Go to the newly created post
		await existingPostPage.goto( postUrl );

		// Wait for it to finish loading
		await existingPostPage.waitForLoadState();

		// ToDo: Sometimes, the block editor doesn't get auto-focused so the tests fails. Re-running fixes it, but that's not right.

		// Go to the end of the existing paragraph
		await existingPostPage.keyboard.press( 'End' );

		// Modify it from the new context
		await existingPostPage.keyboard.type(
			' This was modified from another another browser context.'
		);

		// Get the title and content of the edited post, from the old context
		const pageHTML = await editor.getEditedPostContent();

		// Ensure the contexts are different
		expect( oldContext === newContext ).toBeFalsy();

		// Ensure the pageHTML for the original post containts the new changes we put in place
		expect( pageHTML ).toEqual(
			'<!-- wp:paragraph -->\n<p>This is a paragraph. This was modified from another another browser context.</p>\n<!-- /wp:paragraph -->'
		);

		// Close the new context
		await existingPostPage.close();
		await newContext.close();
	} );
} );
