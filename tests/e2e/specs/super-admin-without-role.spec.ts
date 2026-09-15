/**
 * External dependencies
 */
import { expect, RequestUtils, test } from '@wordpress/e2e-test-utils-playwright';

/**
 * Internal dependencies
 */
import {
	E2E_META_BOX_ID,
	baseUrl,
	deleteTestUser,
	disableEditorGuides,
	editorUrl,
	isMultisite,
	makeSuperAdminWithoutRole,
	getMetaBoxes,
	hasOpenSocket,
	holdRtcHandshakes,
	trackRtcSockets,
	uniqueUsername,
	waitForEditorReady,
	websocketUrl,
} from '../utils/rtc';

const SOCKET_TIMEOUT_MS = 15_000;
const SETTLE_MS = 3_000;

interface CurrentUser {
	id: number;
	roles: string[];
}

interface AuthResponse {
	expires_in: number;
	token: string;
}

/**
 * VIPPROD-1188, the capability theory: `SyncPermissions::setup_default_capabilities()`
 * grants `sync_post` to four roles, so a super admin with no role on the site
 * would be denied a token. WordPress core disagrees: on multisite,
 * `WP_User::has_cap()` grants super admins every capability unless it maps to
 * `do_not_allow`. These tests exercise the real REST endpoint and the real
 * editor as such a user, and they need a multisite tests environment
 * (`env.tests.multisite` in `.wp-env.json`).
 */
test.describe( 'Super admin without a role on the site (VIPPROD-1188)', () => {
	let multisite = false;
	let superAdmin: { id: number } | undefined;
	let superAdminRequests: RequestUtils | undefined;

	test.beforeAll( async ( { requestUtils } ) => {
		// wp-env activates Gutenberg and this plugin from .wp-env.json. The core REST
		// plugins route rejects the dotted `gutenberg.latest-stable` folder name that
		// wp-env derives from the wp.org zip URL, so `activatePlugin()` cannot be used.

		multisite = isMultisite();
		if ( ! multisite ) {
			return;
		}

		const password = 'rtc-super-admin-password';
		const username = uniqueUsername( 'rtcsuperadmin' );
		superAdmin = await requestUtils.createUser( {
			email: `${ username }@example.test`,
			password,
			roles: [ 'subscriber' ],
			username,
		} );
		makeSuperAdminWithoutRole( username, superAdmin.id );

		superAdminRequests = await RequestUtils.setup( {
			baseURL: baseUrl(),
			user: { password, username },
		} );
		// Log in now. `setup()` only creates the context; the login happens on the first REST call.
		await superAdminRequests.setupRest();
	} );

	test.afterAll( async () => {
		await superAdminRequests?.request.dispose();
		if ( superAdmin !== undefined ) {
			deleteTestUser( superAdmin.id );
		}
	} );

	test.beforeEach( () => {
		test.skip(
			! multisite,
			'Super admins only exist on multisite. Run against the multisite tests environment.'
		);
	} );

	test( 'is issued a sync token even though it holds no role on the site', async ( {
		requestUtils,
	} ) => {
		if ( superAdminRequests === undefined ) {
			throw new Error( 'Super admin request context was not initialized' );
		}
		const post = await requestUtils.createPost( {
			date_gmt: new Date().toISOString(),
			status: 'draft',
			title: 'Super admin token',
		} );

		const me = await superAdminRequests.rest< CurrentUser >( {
			params: { context: 'edit' },
			path: '/wp/v2/users/me',
		} );
		expect( me.roles ).toEqual( [] );

		// Under the capability theory this request returns 403 "permission_denied".
		const auth = await superAdminRequests.rest< AuthResponse >( {
			data: {
				syncObjectId: String( post.id ),
				syncObjectType: 'postType/post',
				wpClientId: 'super-admin-e2e',
			},
			method: 'POST',
			path: '/vip-rtc/v1/websocket/auth',
		} );
		expect( auth.token.split( '.' ) ).toHaveLength( 3 );
		expect( auth.expires_in ).toBeGreaterThan( 0 );
	} );

	test( 'connects the editor to the post room', async ( { browser, requestUtils } ) => {
		if ( superAdminRequests === undefined ) {
			throw new Error( 'Super admin request context was not initialized' );
		}
		const post = await requestUtils.createPost( {
			date_gmt: new Date().toISOString(),
			status: 'draft',
			title: 'Super admin editor',
		} );
		const context = await browser.newContext( {
			storageState: await superAdminRequests.request.storageState(),
		} );

		try {
			const page = await context.newPage();
			const sockets = trackRtcSockets( page, websocketUrl( baseUrl() ) );
			const authStatuses: number[] = [];
			page.on( 'response', response => {
				if ( response.url().includes( '/vip-rtc/v1/websocket/auth' ) ) {
					authStatuses.push( response.status() );
				}
			} );

			await page.goto( editorUrl( post.id ) );
			await disableEditorGuides( page );
			await waitForEditorReady( page );

			// The token endpoint accepts the super admin from the editor too.
			await expect
				.poll( () => authStatuses.length, { timeout: SOCKET_TIMEOUT_MS } )
				.toBeGreaterThan( 0 );
			expect( authStatuses ).not.toContain( 403 );
			expect( authStatuses ).toContain( 200 );

			// The socket opens and stays open. Without any classic meta box in
			// the way, being a super admin changes nothing.
			await expect
				.poll( () => hasOpenSocket( sockets ), { timeout: SOCKET_TIMEOUT_MS } )
				.toBe( true );
			await page.waitForTimeout( SETTLE_MS );
			expect( hasOpenSocket( sockets ) ).toBe( true );
			await expect(
				page
					.getByRole( 'dialog' )
					.filter( { hasText: /collaboration|connection|already being edited/i } )
			).toHaveCount( 0 );
		} finally {
			await context.close();
		}
	} );

	test( 'loses collaboration to a capability-gated meta box that an editor never sees', async ( {
		browser,
		requestUtils,
	} ) => {
		if ( superAdminRequests === undefined ) {
			throw new Error( 'Super admin request context was not initialized' );
		}
		const post = await requestUtils.createPost( {
			date_gmt: new Date().toISOString(),
			status: 'draft',
			title: 'Capability-gated meta box',
		} );
		const wsUrl = websocketUrl( baseUrl() );
		// The helper registers the meta box only for users who pass
		// `current_user_can( 'manage_options' )`, which is how plugins gate
		// admin-only boxes. Both users open the same URL.
		const postUrl = editorUrl( post.id, 'capability' );

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
		await editorRequests.setupRest();
		const editorContext = await browser.newContext( {
			storageState: await editorRequests.request.storageState(),
		} );
		const superAdminContext = await browser.newContext( {
			storageState: await superAdminRequests.request.storageState(),
		} );

		try {
			// Phase: the editor fails the capability check, so the meta box is
			// never registered and collaboration connects normally.
			const editorPage = await editorContext.newPage();
			const editorSockets = trackRtcSockets( editorPage, wsUrl );
			await editorPage.goto( postUrl );
			await disableEditorGuides( editorPage );
			await waitForEditorReady( editorPage );
			expect( await getMetaBoxes( editorPage ) ).not.toContainEqual(
				expect.objectContaining( { id: E2E_META_BOX_ID } )
			);
			await expect
				.poll( () => hasOpenSocket( editorSockets ), { timeout: SOCKET_TIMEOUT_MS } )
				.toBe( true );
			await editorPage.close();

			// Phase: the super admin passes every capability check despite
			// holding no role, gets the unflagged meta box, and loses the RTC
			// socket while it is still connecting.
			const superAdminPage = await superAdminContext.newPage();
			const handshakes = await holdRtcHandshakes( superAdminPage, wsUrl );
			await superAdminPage.goto( postUrl );
			await disableEditorGuides( superAdminPage );
			await waitForEditorReady( superAdminPage );
			await expect
				.poll( () => getMetaBoxes( superAdminPage ) )
				.toContainEqual( expect.objectContaining( { id: E2E_META_BOX_ID } ) );
			await expect
				.poll( () => handshakes.closedWhileConnecting, { timeout: SOCKET_TIMEOUT_MS } )
				.toBeGreaterThan( 0 );
			expect( handshakes.released ).toBe( 0 );
			// Phase: the second symptom from the report. With collaboration off,
			// Gutenberg falls back to classic post locking. The editor still holds
			// a fresh lock, so the super admin is told the post is already being
			// edited. The only hint about the real cause is one sentence inside
			// that modal; no RTC error dialog ever appears.
			const lockModal = superAdminPage
				.getByRole( 'dialog' )
				.filter( { hasText: /already being edited/i } );
			await expect( lockModal ).toBeVisible();
			await expect( lockModal ).toContainText(
				/plugins that aren.t compatible with real-time collaboration/i
			);
			await expect(
				superAdminPage.getByRole( 'dialog' ).filter( { hasText: /connection/i } )
			).toHaveCount( 0 );
		} finally {
			await editorContext.close();
			await superAdminContext.close();
			await editorRequests.request.dispose();
			deleteTestUser( editorUser.id );
		}
	} );
} );
