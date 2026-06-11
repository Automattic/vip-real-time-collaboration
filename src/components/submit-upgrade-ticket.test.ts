import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock, type Mock } from 'node:test';

import { submitUpgradeTicket, type UpgradeTicketContext } from './submit-upgrade-ticket';

const BASE_CONTEXT: Omit< UpgradeTicketContext, 'contactAjax' > = {
	siteName: 'Test Site',
	siteUrl: 'https://example.test',
	userName: 'Alice',
	userEmail: 'alice@example.test',
	supportEmail: 'support@wpvip.com',
};

const CONTACT_AJAX = {
	url: 'https://example.test/wp-admin/admin-ajax.php',
	nonce: 'abc123',
};

describe( 'submitUpgradeTicket', () => {
	let originalFetch: typeof globalThis.fetch;
	let locationHref = '';

	beforeEach( () => {
		originalFetch = globalThis.fetch;
		locationHref = '';

		const fakeLocation = {
			origin: 'https://example.test',
			get href(): string {
				return locationHref;
			},
			set href( v: string ) {
				locationHref = v;
			},
		};
		// @ts-expect-error test stub: globalThis.window doesn't exist in node
		globalThis.window = { location: fakeLocation };
	} );

	afterEach( () => {
		globalThis.fetch = originalFetch;
		mock.restoreAll();
		// @ts-expect-error cleanup test stub: globalThis.window doesn't exist in node
		delete globalThis.window;
	} );

	it( 'falls back to mailto: when contactAjax is null', async () => {
		const outcome = await submitUpgradeTicket( { ...BASE_CONTEXT, contactAjax: null } );

		assert.strictEqual( outcome, 'mailto' );
		assert.ok( locationHref.startsWith( 'mailto:support@wpvip.com?' ) );
		assert.ok( locationHref.includes( 'Collaborator%20limit%20upgrade%20request' ) );
	} );

	it( 'POSTs to vip_contact when contactAjax is present', async () => {
		const fetchMock: Mock< typeof globalThis.fetch > = mock.fn( () =>
			Promise.resolve(
				new Response( JSON.stringify( { status: 'success' } ), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				} )
			)
		);
		globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

		const outcome = await submitUpgradeTicket( { ...BASE_CONTEXT, contactAjax: CONTACT_AJAX } );

		assert.strictEqual( outcome, 'submitted' );
		assert.strictEqual( fetchMock.mock.callCount(), 1 );
		const call = fetchMock.mock.calls[ 0 ];
		if ( ! call ) {
			assert.fail( 'expected fetch to be called' );
		}
		const [ url, init ] = call.arguments;
		assert.ok( typeof url === 'string' && url.includes( 'action=vip_contact' ) );
		assert.ok( typeof url === 'string' && url.includes( '_wpnonce=abc123' ) );
		assert.strictEqual( init?.method, 'POST' );
		const body = typeof init?.body === 'string' ? init.body : '';
		assert.ok( body.includes( 'action=vip_contact' ) );
		assert.ok( body.includes( 'name=Alice' ) );
		assert.ok( body.includes( 'priority=Medium' ) );
	} );

	it( 'falls back to mailto: when vip_contact returns an error payload', async () => {
		globalThis.fetch = ( () =>
			Promise.resolve(
				new Response( JSON.stringify( { status: 'error' } ), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				} )
			) ) as unknown as typeof globalThis.fetch;

		const outcome = await submitUpgradeTicket( { ...BASE_CONTEXT, contactAjax: CONTACT_AJAX } );

		assert.strictEqual( outcome, 'mailto' );
		assert.ok( locationHref.startsWith( 'mailto:support@wpvip.com?' ) );
	} );

	it( 'falls back to mailto: on non-2xx response', async () => {
		globalThis.fetch = ( () =>
			Promise.resolve(
				new Response( 'forbidden', { status: 403 } )
			) ) as unknown as typeof globalThis.fetch;

		const outcome = await submitUpgradeTicket( { ...BASE_CONTEXT, contactAjax: CONTACT_AJAX } );

		assert.strictEqual( outcome, 'mailto' );
		assert.ok( locationHref.startsWith( 'mailto:support@wpvip.com?' ) );
	} );

	it( 'falls back to mailto: when fetch throws', async () => {
		globalThis.fetch = ( () =>
			Promise.reject( new Error( 'network down' ) ) ) as unknown as typeof globalThis.fetch;

		const outcome = await submitUpgradeTicket( { ...BASE_CONTEXT, contactAjax: CONTACT_AJAX } );

		assert.strictEqual( outcome, 'mailto' );
	} );
} );
