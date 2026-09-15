/**
 * External dependencies
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import type { Page } from '@playwright/test';
import type { Admin, Editor } from '@wordpress/e2e-test-utils-playwright';

export const WEBSOCKET_URL = process.env.WS_URL ?? 'ws://localhost:1234/_ws';

/**
 * Identifiers used by the test-only mu-plugin in `tests/e2e/mu-plugins`.
 */
export const E2E_META_BOX_ID = 'vip-rtc-e2e-meta-box';
export const E2E_META_BOX_TITLE = 'VIP RTC E2E Meta Box';
export const E2E_META_BOX_QUERY_ARG = 'vip_rtc_e2e_meta_box';

export type E2EMetaBoxMode = 'compatible' | 'incompatible' | 'capability';

export interface EditPostMetaBox {
	id: string;
	title: string;
	__rtc_compatible?: boolean;
}

export interface TrackedSocket {
	closed: boolean;
	receivedFrames: number;
	url: string;
}

export interface HeldHandshakes {
	/** Sockets the page created. */
	created: number;
	/** Sockets the page closed while they were still CONNECTING. */
	closedWhileConnecting: number;
	/** Sockets that were eventually allowed to reach the server. */
	released: number;
}

export function websocketUrl( baseUrl: string ): string {
	return WEBSOCKET_URL.replace( 'localhost', new URL( baseUrl ).hostname );
}

export function baseUrl(): string {
	return String( process.env.WP_BASE_URL ?? 'http://localhost:8889' );
}

export function editorUrl( postId: number, metaBoxMode?: E2EMetaBoxMode ): string {
	const url = new URL( '/wp-admin/post.php', baseUrl() );
	url.searchParams.set( 'post', String( postId ) );
	url.searchParams.set( 'action', 'edit' );
	if ( metaBoxMode ) {
		url.searchParams.set( E2E_META_BOX_QUERY_ARG, metaBoxMode );
	}
	return url.href;
}

/**
 * Open the editor for a post as the default (admin) user, optionally with the
 * test meta box registered.
 */
export async function openPostEditor(
	admin: Admin,
	editor: Editor,
	postId: number,
	metaBoxMode?: E2EMetaBoxMode
): Promise< void > {
	const query = new URLSearchParams( { post: String( postId ), action: 'edit' } );
	if ( metaBoxMode ) {
		query.set( E2E_META_BOX_QUERY_ARG, metaBoxMode );
	}
	await admin.visitAdminPage( 'post.php', query.toString() );
	await editor.setPreferences( 'core/edit-post', {
		welcomeGuide: false,
		fullscreenMode: false,
	} );
}

/**
 * Mirror of `Editor.setPreferences()` for pages that are not driven by the
 * default fixtures (for example a second logged-in user).
 */
export async function disableEditorGuides( page: Page ): Promise< void > {
	await page.waitForFunction( () =>
		Boolean( ( window as unknown as { wp?: { data?: unknown } } ).wp?.data )
	);
	await page.evaluate( async () => {
		const wp = ( window as unknown as { wp: unknown } ).wp as {
			data: {
				dispatch: ( store: string ) => {
					set: ( scope: string, key: string, value: unknown ) => Promise< void >;
				};
			};
		};
		await wp.data.dispatch( 'core/preferences' ).set( 'core/edit-post', 'welcomeGuide', false );
		await wp.data.dispatch( 'core/preferences' ).set( 'core/edit-post', 'fullscreenMode', false );
	} );
}

export async function waitForEditorReady( page: Page ): Promise< void > {
	await page
		.frameLocator( '[name="editor-canvas"]' )
		.locator( '.editor-post-title__input' )
		.waitFor();
	await page.waitForFunction( () => {
		const wp = ( window as unknown as { wp: unknown } ).wp as {
			data: {
				select: ( store: string ) => { __unstableIsEditorReady: () => boolean };
			};
		};
		return wp.data.select( 'core/editor' ).__unstableIsEditorReady();
	} );
}

/**
 * The meta boxes Gutenberg knows about for the current screen. Boxes without
 * `__rtc_compatible: true` make `useMetaBoxInitialization` disable
 * collaboration for the post.
 */
export function getMetaBoxes( page: Page ): Promise< EditPostMetaBox[] > {
	return page.evaluate( () => {
		const wp = ( window as unknown as { wp: unknown } ).wp as {
			data: {
				select: ( store: string ) => { getAllMetaBoxes: () => EditPostMetaBox[] };
			};
		};
		return wp.data.select( 'core/edit-post' ).getAllMetaBoxes();
	} );
}

/**
 * Observe the native WebSockets the page opens against the RTC server.
 */
export function trackRtcSockets( page: Page, wsUrl: string ): TrackedSocket[] {
	const sockets: TrackedSocket[] = [];
	page.on( 'websocket', socket => {
		if ( ! socket.url().startsWith( wsUrl ) ) {
			return;
		}
		const tracked: TrackedSocket = { closed: false, receivedFrames: 0, url: socket.url() };
		sockets.push( tracked );
		socket.on( 'framereceived', () => {
			tracked.receivedFrames += 1;
		} );
		socket.on( 'close', () => {
			tracked.closed = true;
		} );
	} );
	return sockets;
}

export function hasOpenSocket( sockets: TrackedSocket[] ): boolean {
	return sockets.some( socket => socket.receivedFrames > 0 && ! socket.closed );
}

/**
 * Hold every RTC WebSocket handshake so the page-side socket stays in the
 * CONNECTING state until either the page closes it or `holdMs` elapses. This
 * reproduces the slow handshake from the VIPPROD-1188 HAR deterministically:
 * a `close()` issued during CONNECTING is what the browser reports as
 * "WebSocket is closed before the connection is established."
 */
export async function holdRtcHandshakes(
	page: Page,
	wsUrl: string,
	holdMs = 10_000
): Promise< HeldHandshakes > {
	const state: HeldHandshakes = { closedWhileConnecting: 0, created: 0, released: 0 };

	await page.routeWebSocket(
		url => url.href.startsWith( wsUrl ),
		async ws => {
			state.created += 1;
			let closedByPage = false;
			let release: () => void = () => {};
			const released = new Promise< void >( resolve => {
				release = resolve;
			} );
			ws.onClose( () => {
				closedByPage = true;
				release();
			} );
			const timer = setTimeout( release, holdMs );
			await released;
			clearTimeout( timer );

			if ( closedByPage ) {
				state.closedWhileConnecting += 1;
				return;
			}

			state.released += 1;
			const server = ws.connectToServer();
			ws.onClose( ( code, reason ) => server.close( { code, reason } ) );
			server.onClose( ( code, reason ) => ws.close( { code, reason } ) );
		}
	);

	return state;
}

/**
 * Run a WP-CLI command on the wp-env tests site (the site Playwright targets).
 * wp-env prints its own progress lines around the command output; only the
 * command output is returned.
 */
export function wpCli( args: string[] ): string {
	const output = execFileSync( 'npx', [ 'wp-env', 'run', 'tests-cli', 'wp', ...args ], {
		cwd: path.resolve( __dirname, '..', '..', '..' ),
		encoding: 'utf8',
		stdio: [ 'ignore', 'pipe', 'pipe' ],
	} );
	return output
		.split( '\n' )
		.filter( line => ! /^[ℹ✔]/.test( line ) )
		.join( '\n' )
		.trim();
}

export function isMultisite(): boolean {
	try {
		wpCli( [ 'core', 'is-installed', '--network' ] );
		return true;
	} catch {
		return false;
	}
}

/**
 * Turn an existing user into a network super admin and remove them from the
 * tests site. This mirrors the VIPPROD-1188 report: a super admin who is not a
 * member of the site they are editing. On multisite, `wp user delete` without
 * `--network` only removes the user from the current site.
 */
export function makeSuperAdminWithoutRole( username: string, userId: number ): void {
	wpCli( [ 'super-admin', 'add', username ] );
	wpCli( [ 'user', 'delete', String( userId ), '--yes' ] );
	const superAdmins = wpCli( [ 'super-admin', 'list', '--format=csv' ] ).split( '\n' );
	if ( ! superAdmins.includes( username ) ) {
		throw new Error( `Failed to make ${ username } a super admin` );
	}
}

/**
 * Delete a user created for a test. Core's REST API refuses user deletion on
 * multisite, so this goes through WP-CLI on both install types.
 */
export function deleteTestUser( userId: number ): void {
	const login = wpCli( [ 'user', 'get', String( userId ), '--field=user_login' ] );
	try {
		wpCli( [ 'super-admin', 'remove', login ] );
	} catch {
		// Not a super admin, or not multisite.
	}
	// `--reassign` is unsupported on multisite; test users own no content anyway.
	wpCli( [ 'user', 'delete', String( userId ), '--network', '--yes' ] );
}

/**
 * Multisite only accepts lowercase alphanumeric usernames.
 */
export function uniqueUsername( prefix: string ): string {
	return `${ prefix }${ Date.now() }`.replace( /[^a-z0-9]/g, '' );
}
