import assert from 'node:assert';
import { afterEach, describe, it, mock } from 'node:test';
import { Awareness } from 'y-protocols/awareness';
import * as Yjs from 'yjs';

import { createWebSocketConnection } from '../websocket-client';
import { FakePhysicalWebSocket } from './fake-physical-websocket.test-helper';

/**
 * These tests run in their own file so the yjs-shim module state starts
 * unfilled: the test runner starts one process per test file, and the other
 * websocket tests fill the shim by passing the `Y` provider option.
 */
describe( 'createWebSocketConnection without a Yjs module', () => {
	afterEach( () => {
		FakePhysicalWebSocket.instances = [];
		mock.restoreAll();
	} );

	it( 'logs a clear error and returns an inert provider when Y is missing', async () => {
		const logged: unknown[][] = [];
		mock.method( console, 'log', ( ...args: unknown[] ) => {
			logged.push( args );
		} );

		let authFetchCount = 0;
		const providerCreator = createWebSocketConnection( 'wss://example.test/_ws/', {
			multiplexingEnabled: true,
			PhysicalWebSocket: FakePhysicalWebSocket as unknown as typeof WebSocket,
			fetchToken: () => {
				authFetchCount += 1;
				return Promise.resolve( `grant-${ authFetchCount }` );
			},
		} );

		const doc = new Yjs.Doc();
		const awareness = new Awareness( doc );

		const result = await providerCreator( {
			awareness,
			objectType: 'postType/page',
			objectId: '123',
			ydoc: doc,
		} );

		const errorLogs = logged.filter( args =>
			args.some( arg => 'string' === typeof arg && arg.includes( 'no Yjs module available' ) )
		);
		assert.strictEqual( errorLogs.length, 1 );

		// The creator must bail out before doing any connection work.
		assert.strictEqual( FakePhysicalWebSocket.instances.length, 0 );
		assert.strictEqual( authFetchCount, 0 );

		// The inert result must still be safe to use.
		result.on( 'status', () => {} );
		result.destroy();

		// Destroy the awareness interval and doc so the test process can exit.
		awareness.destroy();
		doc.destroy();
	} );
} );
