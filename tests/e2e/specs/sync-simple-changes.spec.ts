/**
 * WordPress dependencies
 */
import { firefox } from '@playwright/test';
import { expect, test } from '@wordpress/e2e-test-utils-playwright';

test.describe( 'Simple changes by one user', () => {
	/**
	 * Tests syncing changes in the same browser.
	 */
	test.describe( 'Fixed blocks sync in the same browser', () => {
		test.beforeEach( async ( { admin } ) => {
			await admin.createNewPost();
		} );

		test.afterEach( async ( { requestUtils } ) => {
			await requestUtils.deleteAllPosts();
		} );

		/**
		 * Verifies that 2 paragraph blocks are synced
		 */
		test( '2 paragraph blocks', async ( { admin, editor, page } ) => {
			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await page.waitForTimeout( 250 );

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

			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await existingPostPage.waitForTimeout( 250 );

			// Insert another block in the original page
			await editor.insertBlock( {
				name: 'core/paragraph',
				attributes: { content: 'This is another paragraph.' },
			} );

			// Get the updated HTML from the new page
			const editedPostContent = await existingPostPage.evaluate( () =>
				// @ts-ignore - TypeScript is not aware of the wp global, this'll be tweaked in the future once the waitForTimeout issue is fixed.
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

		/**
		 * Verifies that a heading and quote block are synced
		 */
		test( 'a heading and quote block', async ( { admin, editor, page } ) => {
			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await page.waitForTimeout( 250 );

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

			await editor.insertBlock( {
				name: 'core/quote',
				attributes: { value: '<p>Quote Content</p>' },
			} );

			// Save this draft
			await editor.saveDraft();

			// Get the updated HTML from the new page
			const editedPostContent = await existingPostPage.evaluate( () =>
				// @ts-ignore - TypeScript is not aware of the wp global, this'll be tweaked in the future once the waitForTimeout issue is fixed.
				window.wp.data.select( 'core/editor' ).getEditedPostContent()
			);

			// Ensure the contexts are different
			expect( oldContext === newContext ).toBeFalsy();

			// Ensure the new page contains the changes from the old page
			expect( editedPostContent ).toEqual(
				'<!-- wp:heading -->\n<h2 class="wp-block-heading">This is a heading.</h2>\n<!-- /wp:heading -->\n\n<!-- wp:quote -->\n<blockquote class="wp-block-quote"><!-- wp:paragraph -->\n<p>Quote Content</p>\n<!-- /wp:paragraph --></blockquote>\n<!-- /wp:quote -->'
			);

			// Close the second session
			await existingPostPage.close();
			await newContext.close();
		} );

		/**
		 * Verifies that a list and pre-formatted block are synced
		 */
		test( 'a list and pre-formatted block', async ( { admin, editor, page } ) => {
			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await page.waitForTimeout( 250 );

			// Enter a title
			await page.keyboard.type( 'Post 1' );

			await editor.insertBlock( { name: 'core/list' } );

			await page.keyboard.type( 'one' );

			await page.keyboard.press( 'Enter' );

			await page.keyboard.type( 'two' );

			await page.keyboard.press( 'Enter' );

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

			await editor.insertBlock( { name: 'core/preformatted' } );

			await page.keyboard.type( '1' );

			await page.keyboard.press( 'Enter' );

			await page.keyboard.type( '2' );

			await editor.insertBlock( { name: 'core/paragraph' } );

			await page.keyboard.type( '3' );

			await page.keyboard.press( 'ArrowLeft' );

			await page.keyboard.press( 'Backspace' );

			// Save this draft
			await editor.saveDraft();

			// Get the updated HTML from the new page
			const editedPostContent = await existingPostPage.evaluate( () =>
				// @ts-ignore - TypeScript is not aware of the wp global, this'll be tweaked in the future once the waitForTimeout issue is fixed.
				window.wp.data.select( 'core/editor' ).getEditedPostContent()
			);

			// Ensure the contexts are different
			expect( oldContext === newContext ).toBeFalsy();

			// Ensure the new page contains the changes from the old page
			expect( editedPostContent ).toEqual(
				'<!-- wp:list -->\n<ul class="wp-block-list"><!-- wp:list-item -->\n<li>one</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>two</li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list -->\n\n<!-- wp:paragraph -->\n<p></p>\n<!-- /wp:paragraph -->\n\n<!-- wp:preformatted -->\n<pre class="wp-block-preformatted">1<br>2<br><br>3</pre>\n<!-- /wp:preformatted -->'
			);

			// Close the second session
			await existingPostPage.close();
			await newContext.close();
		} );
	} );

	/**
	 * Tests syncing changes in different browsers.
	 */
	test.describe( 'Fixed blocks sync in different browsers', () => {
		test.beforeEach( async ( { admin } ) => {
			await admin.createNewPost();
		} );

		test.afterEach( async ( { requestUtils } ) => {
			await requestUtils.deleteAllPosts();
		} );

		/**
		 * Verifies that 2 paragraph blocks are synced
		 */
		test( '2 paragraph blocks', async ( { admin, editor, page } ) => {
			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await page.waitForTimeout( 250 );

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

			const firefoxInstance = await firefox.launch();

			const firefoxContext = await firefoxInstance.newContext();

			const firefoxPage = await firefoxContext.newPage();

			await firefoxPage.goto( postUrl );

			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await firefoxPage.waitForTimeout( 250 );

			// Insert another block in the original page
			await editor.insertBlock( {
				name: 'core/paragraph',
				attributes: { content: 'This is another paragraph.' },
			} );

			// Get the updated HTML from the new page
			const editedPostContent = await firefoxPage.evaluate( () =>
				// @ts-ignore - TypeScript is not aware of the wp global, this'll be tweaked in the future once the waitForTimeout issue is fixed.
				window.wp.data.select( 'core/editor' ).getEditedPostContent()
			);

			// Ensure the contexts are different
			expect( oldContext === firefoxContext ).toBeFalsy();

			// Ensure the new page contains the changes from the old page
			expect( editedPostContent ).toEqual(
				'<!-- wp:paragraph -->\n<p>This is a paragraph.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p>This is another paragraph.</p>\n<!-- /wp:paragraph -->'
			);

			// Close the new context and pages
			await firefoxPage.close();
			await firefoxContext.close();
			await firefoxInstance.close();
		} );

		/**
		 * Verifies that the plugin sync changes between different sessions in different browsers - chromium and firefox
		 */
		test( 'a heading and quote block between different sessions in different browsers', async ( {
			admin,
			editor,
			page,
		} ) => {
			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await page.waitForTimeout( 250 );

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
			await firefoxPage.waitForTimeout( 250 );

			await editor.insertBlock( {
				name: 'core/quote',
				attributes: { value: '<p>Quote Content</p>' },
			} );

			// Save this draft
			await editor.saveDraft();

			// Get the updated HTML from the new page
			const editedPostContent = await firefoxPage.evaluate( () =>
				// @ts-ignore - TypeScript is not aware of the wp global, this'll be tweaked in the future once the waitForTimeout issue is fixed.
				window.wp.data.select( 'core/editor' ).getEditedPostContent()
			);

			// Ensure the contexts are different
			expect( oldContext === firefoxContext ).toBeFalsy();

			// Ensure the new page contains the changes from the old page
			expect( editedPostContent ).toEqual(
				'<!-- wp:heading -->\n<h2 class="wp-block-heading">This is a heading.</h2>\n<!-- /wp:heading -->\n\n<!-- wp:quote -->\n<blockquote class="wp-block-quote"><!-- wp:paragraph -->\n<p>Quote Content</p>\n<!-- /wp:paragraph --></blockquote>\n<!-- /wp:quote -->'
			);

			// Close firefox
			await firefoxPage.close();
			await firefoxContext.close();
			await firefoxInstance.close();
		} );

		/**
		 * Verifies that a list and pre-formatted block are synced
		 */
		test( 'a list and pre-formatted block', async ( { admin, editor, page } ) => {
			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await page.waitForTimeout( 250 );

			// Enter a title
			await page.keyboard.type( 'Post 1' );

			await editor.insertBlock( { name: 'core/list' } );

			await page.keyboard.type( 'one' );

			await page.keyboard.press( 'Enter' );

			await page.keyboard.type( 'two' );

			await page.keyboard.press( 'Enter' );

			await page.keyboard.press( 'Enter' );

			// Save this draft
			await editor.saveDraft();

			// Get the post's URL so another session can be opened
			const postUrl = page.url();

			// Store the old context for comparison
			const oldContext = admin.context;

			const firefoxInstance = await firefox.launch();

			const firefoxContext = await firefoxInstance.newContext();

			const firefoxPage = await firefoxContext.newPage();

			await firefoxPage.goto( postUrl );

			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await firefoxPage.waitForTimeout( 250 );

			await editor.insertBlock( { name: 'core/preformatted' } );

			await page.keyboard.type( '1' );

			await page.keyboard.press( 'Enter' );

			await page.keyboard.type( '2' );

			await editor.insertBlock( { name: 'core/paragraph' } );

			await page.keyboard.type( '3' );

			await page.keyboard.press( 'ArrowLeft' );

			await page.keyboard.press( 'Backspace' );

			// Save this draft
			await editor.saveDraft();

			// Get the updated HTML from the new page
			const editedPostContent = await firefoxPage.evaluate( () =>
				// @ts-ignore - TypeScript is not aware of the wp global, this'll be tweaked in the future once the waitForTimeout issue is fixed.
				window.wp.data.select( 'core/editor' ).getEditedPostContent()
			);

			// Ensure the contexts are different
			expect( oldContext === firefoxContext ).toBeFalsy();

			// Ensure the new page contains the changes from the old page
			expect( editedPostContent ).toEqual(
				'<!-- wp:list -->\n<ul class="wp-block-list"><!-- wp:list-item -->\n<li>one</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>two</li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list -->\n\n<!-- wp:paragraph -->\n<p></p>\n<!-- /wp:paragraph -->\n\n<!-- wp:preformatted -->\n<pre class="wp-block-preformatted">1<br>2<br><br>3</pre>\n<!-- /wp:preformatted -->'
			);

			// Close the second session
			await firefoxPage.close();
			await firefoxContext.close();
			await firefoxInstance.close();
		} );
	} );
} );
