/**
 * WordPress dependencies
 */
import { firefox, request } from '@playwright/test';
import { expect, test } from '@wordpress/e2e-test-utils-playwright';

/**
 * Tests the sync changes functionality of the plugin.
 */
test.describe( 'The plugin should sync simple changes', () => {
	test.afterEach( async ( { requestUtils } ) => {
		await requestUtils.deleteAllPosts();
	} );

	/**
	 * Verifies that the plugin sync changes between browser sessions
	 */
	test( 'between different sessions in the same browser', async ( { admin, editor, page } ) => {
		await admin.createNewPost();

		// This ensures that the block editor has fully loaded before we do any action.
		await page.waitForFunction( () => window?.wp?.data?.select( 'core/block-editor' ).getBlocks() );

		// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
		// ToDo: Find a better way
		await page.waitForTimeout( 500 );

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

		// Store the old context for comparison
		const oldContext = admin.context;

		// Open another browser context, within Chromium itself
		const newContext = await admin.browser.newContext();

		// Open a new page within the new context
		const existingPostPage = await newContext.newPage();

		// Go to the newly created post
		await existingPostPage.goto( postUrl );

		// This ensures that the block editor has fully loaded before we do any action.
		await existingPostPage.waitForFunction( () =>
			window?.wp?.data?.select( 'core/block-editor' ).getBlocks()
		);

		// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
		// ToDo: Find a better way
		await existingPostPage.waitForTimeout( 500 );

		// Insert another block in the original page
		await editor.insertBlock( {
			name: 'core/paragraph',
			attributes: { content: 'This is another paragraph.' },
		} );

		// This ensures that the block editor has fully loaded before we do any action.
		await existingPostPage.waitForFunction( () =>
			window?.wp?.data?.select( 'core/block-editor' ).getBlocks()
		);

		// Get the updated HTML from the new page
		const editedPostContent = await existingPostPage.evaluate( () =>
			window.wp.data.select( 'core/editor' ).getEditedPostContent()
		);

		// Ensure the contexts are different
		expect( oldContext === newContext ).toBeFalsy();

		// Ensure the new page contains the changes from the old page
		expect( editedPostContent ).toEqual(
			'<!-- wp:paragraph -->\n<p>This is a paragraph.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p>This is another paragraph.</p>\n<!-- /wp:paragraph -->'
		);

		// Close the new context and pages
		await existingPostPage.close();
		await newContext.close();
	} );

	test( 'between different sessions in different browsers', async ( { admin, editor, page } ) => {
		await admin.createNewPost();

		// This ensures that the block editor has fully loaded before we do any action.
		await page.waitForFunction( () => window?.wp?.data?.select( 'core/block-editor' ).getBlocks() );

		// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
		// ToDo: Find a better way
		await page.waitForTimeout( 500 );

		// Enter a title
		await page.keyboard.type( 'Post 1' );

		// Insert a heading block
		await editor.insertBlock( {
			attributes: {
				level: 2,
			},
			name: 'core/heading',
		} );

		await page.keyboard.type( 'This is a heading.' );

		// Save this draft
		await editor.saveDraft();

		// Get the post's URL so another session can be opened
		const postUrl = page.url();

		// Store the old context for cleanup
		const oldContext = admin.context;

		const firefoxInstance = await firefox.launch();

		const firefoxContext = await firefoxInstance.newContext();

		const firefoxPage = await firefoxContext.newPage();

		await firefoxPage.goto( postUrl );

		// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
		// ToDo: Find a better way
		await firefoxPage.waitForTimeout( 500 );

		// This ensures that the block editor has fully loaded before we do any action.
		await firefoxPage.waitForFunction( () =>
			window?.wp?.data?.select( 'core/block-editor' ).getBlocks()
		);

		await editor.insertBlock( {
			name: 'core/quote',
			attributes: { value: '<p>Quote Content</p>' },
		} );

		// Save this draft
		await editor.saveDraft();

		// Get the updated HTML from the new page
		const editedPostContent = await firefoxPage.evaluate( () =>
			window.wp.data.select( 'core/editor' ).getEditedPostContent()
		);

		// Ensure the contexts are different
		expect( oldContext === firefoxContext ).toBeFalsy();

		// Ensure the new page contains the changes from the old page
		expect( editedPostContent ).toEqual(
			'<!-- wp:heading -->\n<h2 class="wp-block-heading">This is a heading.</h2>\n<!-- /wp:heading -->\n\n<!-- wp:quote -->\n<blockquote class="wp-block-quote"><!-- wp:paragraph -->\n<p>Quote Content</p>\n<!-- /wp:paragraph --></blockquote>\n<!-- /wp:quote -->'
		);

		// Close the new context and pages
		await firefoxPage.close();
		await firefoxContext.close();
	} );
} );
