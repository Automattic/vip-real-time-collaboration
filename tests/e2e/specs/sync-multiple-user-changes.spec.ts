/**
 * WordPress dependencies
 */
import { firefox } from '@playwright/test';
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
		 * Verifies that paragraph blocks are synced
		 */
		test( 'paragraph blocks only', async ( { admin, editor, page } ) => {
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

			await existingPostPage.keyboard.press( 'Backspace' );

			await existingPostPage.keyboard.press( 'Backspace' );

			await existingPostPage.keyboard.press( 'ArrowDown' );

			await existingPostPage.keyboard.press( 'End' );

			await existingPostPage.keyboard.type( 'I have updated this paragraph.' );

			// Get the updated HTML from the new page
			const editedPostContent = await existingPostPage.evaluate( () =>
				// @ts-ignore - TypeScript is not aware of the wp global. Not worth adding that support in just for tests
				window.wp.data.select( 'core/editor' ).getEditedPostContent()
			);

			// Ensure the contexts are different
			expect( oldContext === newContext ).toBeFalsy();

			// Ensure the new page contains the changes from the old page
			expect( editedPostContent ).toEqual(
				'<!-- wp:paragraph -->\n<p></p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p>This is a paragraph.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p>This is another paragraph.I have updated this paragraph.</p>\n<!-- /wp:paragraph -->'
			);

			// Close the new context and pages
			await existingPostPage.close();
			await newContext.close();
		} );

		test( 'Random blocks', async ( { admin, editor, page } ) => {
			const randomBlocksInserted = [];

			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await page.waitForTimeout( 250 );

			// Enter a title
			await page.keyboard.type( 'Post 1' );

			await page.keyboard.press( 'Enter' );

			// Save this draft
			await editor.saveDraft();

			// Insert a random block, and access it immediately
			randomBlocksInserted.push( getRandomBlockToInsert() );
			await editor.insertBlock( randomBlocksInserted[ randomBlocksInserted.length - 1 ]! );

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

			await existingPostPage.keyboard.press( 'Backspace' );

			// Insert a random block, and access it immediately
			randomBlocksInserted.push( getRandomBlockToInsert() );
			await editor.insertBlock( randomBlocksInserted[ randomBlocksInserted.length - 1 ]! );

			await existingPostPage.keyboard.press( 'Enter' );

			// Insert a random block, and access it immediately
			randomBlocksInserted.push( getRandomBlockToInsert() );
			await editor.insertBlock( randomBlocksInserted[ randomBlocksInserted.length - 1 ]! );

			// Get the updated HTML from the new page
			const editedPostContent = await existingPostPage.evaluate( () =>
				// @ts-ignore - TypeScript is not aware of the wp global. Not worth adding that support in just for tests
				window.wp.data.select( 'core/editor' ).getEditedPostContent()
			);

			// Ensure the contexts are different
			expect( oldContext === newContext ).toBeFalsy();

			// Generate the expected post content, ensuring that no new line is added at the end.
			let expectedPostContent =
				'<!-- wp:paragraph -->\n<p></p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p></p>\n<!-- /wp:paragraph -->\n\n';
			for ( let i = 0; i < randomBlocksInserted.length; i++ ) {
				expectedPostContent += getPostToVerifyFromRandomBlock( randomBlocksInserted[ i ]! );
				if ( i < randomBlocksInserted.length - 1 ) {
					expectedPostContent += '\n\n';
				}
			}

			expect( editedPostContent ).toEqual( expectedPostContent );

			// Close the new context and pages
			await existingPostPage.close();
			await newContext.close();
		} );
	} );

	/**
	 * Tests syncing changes in different browsers.
	 */
	test.describe( 'in different browsers', () => {
		test.beforeEach( async ( { admin } ) => {
			await admin.createNewPost();
		} );

		test.afterEach( async ( { requestUtils } ) => {
			await requestUtils.deleteAllPosts();
		} );

		/**
		 * Verifies that paragraph blocks are synced
		 */
		test( 'paragraph blocks only', async ( { admin, editor, page } ) => {
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

			const firefoxInstance = await firefox.launch();

			const firefoxContext = await firefoxInstance.newContext();

			const firefoxPage = await firefoxContext.newPage();

			await firefoxPage.goto( postUrl );

			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await firefoxPage.waitForTimeout( 250 );

			// This allows for a consistent focus in the second session, without needing to be concerned with Gutenberg not automatically doing this.
			const emptyParagraph = firefoxPage
				.frameLocator( '[name="editor-canvas"]' )
				.locator( '[data-type="core/paragraph"][data-empty="true"]' );
			await emptyParagraph.click();

			await firefoxPage.keyboard.press( 'Enter' );

			await firefoxPage.keyboard.type( 'This is a paragraph.' );

			await firefoxPage.keyboard.press( 'Enter' );

			// Insert another block in the original page
			await editor.insertBlock( {
				name: 'core/paragraph',
				attributes: { content: 'This is another paragraph.' },
			} );

			await firefoxPage.keyboard.press( 'Backspace' );

			await firefoxPage.keyboard.press( 'Backspace' );

			await firefoxPage.keyboard.press( 'ArrowDown' );

			await firefoxPage.keyboard.press( 'End' );

			await firefoxPage.keyboard.type( 'I have updated this paragraph.' );

			// Get the updated HTML from the new page
			const editedPostContent = await firefoxPage.evaluate( () =>
				// @ts-ignore - TypeScript is not aware of the wp global. Not worth adding that support in just for tests
				window.wp.data.select( 'core/editor' ).getEditedPostContent()
			);

			// Ensure the contexts are different
			expect( oldContext === firefoxContext ).toBeFalsy();

			// Ensure the new page contains the changes from the old page
			expect( editedPostContent ).toEqual(
				'<!-- wp:paragraph -->\n<p></p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p>This is a paragraph.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p>This is another paragraph.I have updated this paragraph.</p>\n<!-- /wp:paragraph -->'
			);

			// Close the new context and pages
			await firefoxPage.close();
			await firefoxContext.close();
			await firefoxInstance.close();
		} );

		test( 'Random blocks', async ( { admin, editor, page } ) => {
			const randomBlocksInserted = [];

			// Sometimes Gutenberg will take a while to make the post editable. This is to account for that.
			// ToDo: Find a better way
			await page.waitForTimeout( 250 );

			// Enter a title
			await page.keyboard.type( 'Post 1' );

			await page.keyboard.press( 'Enter' );

			// Save this draft
			await editor.saveDraft();

			// Insert a random block, and access it immediately
			randomBlocksInserted.push( getRandomBlockToInsert() );
			await editor.insertBlock( randomBlocksInserted[ randomBlocksInserted.length - 1 ]! );

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

			// This allows for a consistent focus in the second session, without needing to be concerned with Gutenberg not automatically doing this.
			const emptyParagraph = firefoxPage
				.frameLocator( '[name="editor-canvas"]' )
				.locator( '[data-type="core/paragraph"][data-empty="true"]' );
			await emptyParagraph.click();

			await firefoxPage.keyboard.press( 'Enter' );

			await firefoxPage.keyboard.press( 'Backspace' );

			// Insert a random block, and access it immediately
			randomBlocksInserted.push( getRandomBlockToInsert() );
			await editor.insertBlock( randomBlocksInserted[ randomBlocksInserted.length - 1 ]! );

			await firefoxPage.keyboard.press( 'Enter' );

			// Insert a random block, and access it immediately
			randomBlocksInserted.push( getRandomBlockToInsert() );
			await editor.insertBlock( randomBlocksInserted[ randomBlocksInserted.length - 1 ]! );

			// Get the updated HTML from the new page
			const editedPostContent = await firefoxPage.evaluate( () =>
				// @ts-ignore - TypeScript is not aware of the wp global. Not worth adding that support in just for tests
				window.wp.data.select( 'core/editor' ).getEditedPostContent()
			);

			// Ensure the contexts are different
			expect( oldContext === firefoxContext ).toBeFalsy();

			// Generate the expected post content, ensuring that no new line is added at the end.
			let expectedPostContent =
				'<!-- wp:paragraph -->\n<p></p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p></p>\n<!-- /wp:paragraph -->\n\n';
			for ( let i = 0; i < randomBlocksInserted.length; i++ ) {
				expectedPostContent += getPostToVerifyFromRandomBlock( randomBlocksInserted[ i ]! );
				if ( i < randomBlocksInserted.length - 1 ) {
					expectedPostContent += '\n\n';
				}
			}

			expect( editedPostContent ).toEqual( expectedPostContent );

			// Close the new context and pages
			await firefoxPage.close();
			await firefoxContext.close();
			await firefoxInstance.close();
		} );
	} );
} );

/**
 * Get a random block to insert in Gutenberg.
 *
 * Supported blocks - paragraph, heading, quote, list, preformatted, and html
 */
function getRandomBlockToInsert(): { name: string; attributes: Record< string, any > } {
	const blocks = [
		{
			name: 'core/paragraph',
			attributes: { content: 'Random paragraph content' },
		},
		{
			name: 'core/heading',
			attributes: {
				level: Math.floor( Math.random() * 6 ) + 1,
				content: 'Random heading',
			},
		},
		{
			name: 'core/quote',
			attributes: { value: '<p>Random quote content</p>' },
		},
		{
			name: 'core/list',
			attributes: {
				values: '<li>1</li><li>2</li>',
			},
		},
		{
			name: 'core/preformatted',
			attributes: { content: 'Random preformatted text' },
		},
		{
			name: 'core/html',
			attributes: { content: '<p>Random HTML content</p>' },
		},
		{
			name: 'core/pullquote',
			attributes: { value: 'test', citation: 'Random pullquote citation' },
		},
	] as const;

	const randomIndex = Math.floor( Math.random() * blocks.length );

	return blocks[ randomIndex ]!;
}

function getPostToVerifyFromRandomBlock( block: {
	name: string;
	attributes: Record< string, any >;
} ): string {
	switch ( block.name ) {
		case 'core/paragraph':
			return '<!-- wp:paragraph -->\n<p>Random paragraph content</p>\n<!-- /wp:paragraph -->';
		case 'core/heading':
			return `<!-- wp:heading${
				block.attributes.level > 2 ? ` {"level":${ block.attributes.level }}` : ''
			} -->\n<h${ block.attributes.level } class="wp-block-heading">Random heading</h${
				block.attributes.level
			}>\n<!-- /wp:heading -->`;
		case 'core/quote':
			return '<!-- wp:quote -->\n<blockquote class="wp-block-quote"><!-- wp:paragraph -->\n<p>Random quote content</p>\n<!-- /wp:paragraph --></blockquote>\n<!-- /wp:quote -->';
		case 'core/list':
			return '<!-- wp:list -->\n<ul class="wp-block-list"><!-- wp:list-item -->\n<li>1</li>\n<!-- /wp:list-item -->\n\n<!-- wp:list-item -->\n<li>2</li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list -->';
		case 'core/preformatted':
			return '<!-- wp:preformatted -->\n<pre class="wp-block-preformatted">Random preformatted text</pre>\n<!-- /wp:preformatted -->';
		case 'core/html':
			return '<!-- wp:html -->\n<p>Random HTML content</p>\n<!-- /wp:html -->';
		case 'core/pullquote':
			return '<!-- wp:pullquote -->\n<figure class="wp-block-pullquote"><blockquote><p>test</p><cite>Random pullquote citation</cite></blockquote></figure>\n<!-- /wp:pullquote -->';
		default:
			return '';
	}
}
