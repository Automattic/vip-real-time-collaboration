/**
 * External dependencies
 */
import { expect, RequestUtils, test } from '@wordpress/e2e-test-utils-playwright';

/**
 * Internal dependencies
 */
import {
	E2E_META_BOX_ID,
	E2E_META_BOX_TITLE,
	baseUrl,
	deleteTestUser,
	disableEditorGuides,
	editorUrl,
	getMetaBoxes,
	hasOpenSocket,
	holdRtcHandshakes,
	openPostEditor,
	trackRtcSockets,
	uniqueUsername,
	waitForEditorReady,
	websocketUrl,
} from '../utils/rtc';

const SOCKET_TIMEOUT_MS = 15_000;
const SETTLE_MS = 3_000;

/**
 * VIPPROD-1188: a super admin on mansueto.com saw "WebSocket is closed before
 * the connection is established", no error dialog, and later a native
 * "already being edited" lock. The theory under test: Gutenberg's edit-post
 * package detects a classic meta box without the `__rtc_compatible_meta_box`
 * flag, dispatches `setCollaborationSupported( false )`, and that tears down
 * every sync provider (closing the socket) without telling the user.
 *
 * Super admins hit this because they hold every capability, so meta boxes
 * that plugins register behind a capability check appear only for them.
 */
test.describe( 'Classic meta boxes and real-time collaboration (VIPPROD-1188)', () => {
	test.beforeAll( async ( { requestUtils } ) => {
		// wp-env activates Gutenberg and this plugin from .wp-env.json. The core REST
		// plugins route rejects the dotted `gutenberg.latest-stable` folder name that
		// wp-env derives from the wp.org zip URL, so `activatePlugin()` cannot be used.
	} );

	test.afterEach( async ( { requestUtils } ) => {
		await requestUtils.deleteAllPosts();
	} );

	test( 'control: a meta box flagged as compatible leaves the RTC connection open', async ( {
		admin,
		editor,
		page,
		requestUtils,
	} ) => {
		const post = await requestUtils.createPost( {
			date_gmt: new Date().toISOString(),
			status: 'draft',
			title: 'Compatible meta box',
		} );
		const sockets = trackRtcSockets( page, websocketUrl( baseUrl() ) );

		await openPostEditor( admin, editor, post.id, 'compatible' );
		await waitForEditorReady( page );

		// The meta box is registered and carries Gutenberg's opt-in flag.
		await expect
			.poll( () => getMetaBoxes( page ) )
			.toContainEqual(
				expect.objectContaining( {
					id: E2E_META_BOX_ID,
					title: E2E_META_BOX_TITLE,
					__rtc_compatible: true,
				} )
			);

		// The editor connects to the RTC server and stays connected.
		await expect
			.poll( () => hasOpenSocket( sockets ), { timeout: SOCKET_TIMEOUT_MS } )
			.toBe( true );
		await page.waitForTimeout( SETTLE_MS );
		expect( hasOpenSocket( sockets ) ).toBe( true );
	} );

	test( 'an unflagged meta box closes the RTC socket before it opens and tells the user why', async ( {
		admin,
		editor,
		page,
		requestUtils,
	} ) => {
		const post = await requestUtils.createPost( {
			date_gmt: new Date().toISOString(),
			status: 'draft',
			title: 'Incompatible meta box',
		} );
		const handshakes = await holdRtcHandshakes( page, websocketUrl( baseUrl() ) );

		await openPostEditor( admin, editor, post.id, 'incompatible' );
		await waitForEditorReady( page );

		// Phase: the trigger. The meta box is registered without the opt-in flag.
		await expect
			.poll( () => getMetaBoxes( page ) )
			.toContainEqual(
				expect.objectContaining( { id: E2E_META_BOX_ID, title: E2E_META_BOX_TITLE } )
			);
		const metaBoxes = await getMetaBoxes( page );
		expect(
			metaBoxes.find( metaBox => metaBox.id === E2E_META_BOX_ID )?.__rtc_compatible
		).not.toBe( true );

		// Phase: the symptom. The page closes its RTC socket while the socket
		// is still CONNECTING, which is exactly what the browser logs as
		// "WebSocket is closed before the connection is established."
		await expect
			.poll( () => handshakes.closedWhileConnecting, { timeout: SOCKET_TIMEOUT_MS } )
			.toBeGreaterThan( 0 );
		expect( handshakes.released ).toBe( 0 );

		// Phase: the provider was destroyed, not disconnected. No replacement
		// socket is attempted.
		const createdAfterTeardown = handshakes.created;
		await page.waitForTimeout( SETTLE_MS );
		expect( handshakes.created ).toBe( createdAfterTeardown );

		// Phase: nothing is surfaced. Neither Gutenberg's sync error modal nor
		// the plugin's limit modal opens, because both hide themselves once
		// collaboration is reported as unsupported.
		await expect(
			page.getByRole( 'dialog' ).filter( { hasText: /collaboration|connection/i } )
		).toHaveCount( 0 );

		// Phase (fails today): the desired behaviour. The editor should tell
		// the user that real-time collaboration was switched off and name the
		// meta box responsible, instead of silently falling back to
		// single-user editing.
		await expect(
			page.getByText( new RegExp( `real-time collaboration.*${ E2E_META_BOX_TITLE }`, 'i' ) )
		).toBeVisible();
	} );

	test( 'a collaborating editor is not locked out after a non-collaborating user opened the post', async ( {
		admin,
		browser,
		editor,
		page,
		requestUtils,
	} ) => {
		const post = await requestUtils.createPost( {
			date_gmt: new Date().toISOString(),
			status: 'draft',
			title: 'Lock interplay',
		} );
		const wsUrl = websocketUrl( baseUrl() );
		const password = 'rtc-editor-password';
		const username = uniqueUsername( 'rtceditor' );
		const editorUser = await requestUtils.createUser( {
			email: `${ username }@example.test`,
			password,
			roles: [ 'editor' ],
			username,
		} );
		const editorRequests = await RequestUtils.setup( {
			baseURL: baseUrl(),
			user: { password, username },
		} );
		// Log in now. `setup()` only creates the context; the login happens on the first REST call.
		await editorRequests.setupRest();
		const peerContext = await browser.newContext( {
			storageState: await editorRequests.request.storageState(),
		} );

		try {
			// Phase: the first user gets the incompatible meta box, loses
			// collaboration, and therefore keeps refreshing the classic post
			// lock through Heartbeat.
			await openPostEditor( admin, editor, post.id, 'incompatible' );
			await waitForEditorReady( page );

			// Phase: an editor without that meta box opens the same post.
			const peerPage = await peerContext.newPage();
			const peerSockets = trackRtcSockets( peerPage, wsUrl );
			await peerPage.goto( editorUrl( post.id ) );
			await disableEditorGuides( peerPage );
			await waitForEditorReady( peerPage );

			// Collaboration is enabled for the editor, so the RTC connection
			// opens and Gutenberg suppresses the "already being edited" modal
			// even though the first user holds the classic lock.
			await expect
				.poll( () => hasOpenSocket( peerSockets ), { timeout: SOCKET_TIMEOUT_MS } )
				.toBe( true );
			await expect(
				peerPage.getByRole( 'dialog' ).filter( { hasText: /already being edited|taken over/i } )
			).toHaveCount( 0 );
			await peerPage.waitForTimeout( SETTLE_MS );
			await expect(
				peerPage.getByRole( 'dialog' ).filter( { hasText: /already being edited|taken over/i } )
			).toHaveCount( 0 );
			expect( hasOpenSocket( peerSockets ) ).toBe( true );
		} finally {
			await peerContext.close();
			await editorRequests.request.dispose();
			deleteTestUser( editorUser.id );
		}
	} );
} );
