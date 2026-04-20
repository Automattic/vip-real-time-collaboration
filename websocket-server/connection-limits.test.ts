import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
	getActiveCollaboratorCount,
	isUserActive,
	shouldAllowCollaboratorWithLimit,
} from './connection-limits';

import type { WebSocket, WebSocketServer } from 'ws';

function createMockClient( fields: { userId?: number; wpClientId?: string } ): WebSocket {
	return { userId: fields.userId, wpClientId: fields.wpClientId } as unknown as WebSocket;
}

function createMockWss( clients: WebSocket[] ): WebSocketServer {
	return { clients: new Set( clients ) } as unknown as WebSocketServer;
}

describe( 'getActiveCollaboratorCount', () => {
	it( 'counts unique user IDs', () => {
		const wss = createMockWss( [
			createMockClient( { userId: 1 } ),
			createMockClient( { userId: 1 } ),
			createMockClient( { userId: 2 } ),
			createMockClient( { userId: 3 } ),
		] );

		assert.strictEqual( getActiveCollaboratorCount( wss ), 3 );
	} );

	it( 'returns 0 when no clients are connected', () => {
		assert.strictEqual( getActiveCollaboratorCount( createMockWss( [] ) ), 0 );
	} );
} );

describe( 'isUserActive', () => {
	it( 'returns true when the user has an active connection', () => {
		const wss = createMockWss( [ createMockClient( { userId: 7 } ) ] );
		assert.strictEqual( isUserActive( wss, 7 ), true );
	} );

	it( 'returns false when the user has no active connection', () => {
		const wss = createMockWss( [ createMockClient( { userId: 7 } ) ] );
		assert.strictEqual( isUserActive( wss, 8 ), false );
	} );
} );

describe( 'shouldAllowCollaboratorWithLimit', () => {
	it( 'always allows when maxCollaborators is -1', () => {
		const wss = createMockWss( [
			createMockClient( { userId: 1 } ),
			createMockClient( { userId: 2 } ),
		] );

		assert.strictEqual( shouldAllowCollaboratorWithLimit( wss, 3, -1 ), true );
	} );

	it( 'allows a new user while under the limit', () => {
		const wss = createMockWss( [
			createMockClient( { userId: 1 } ),
			createMockClient( { userId: 2 } ),
		] );

		assert.strictEqual( shouldAllowCollaboratorWithLimit( wss, 3, 3 ), true );
	} );

	it( 'rejects a new user at the limit', () => {
		const wss = createMockWss( [
			createMockClient( { userId: 1 } ),
			createMockClient( { userId: 2 } ),
		] );

		assert.strictEqual( shouldAllowCollaboratorWithLimit( wss, 3, 2 ), false );
	} );

	it( 'allows an already-active user even at the limit', () => {
		const wss = createMockWss( [
			createMockClient( { userId: 1 } ),
			createMockClient( { userId: 2 } ),
		] );

		assert.strictEqual( shouldAllowCollaboratorWithLimit( wss, 1, 2 ), true );
	} );

	it( 'rejects a null userId when under the limit', () => {
		const wss = createMockWss( [ createMockClient( { userId: 1 } ) ] );

		assert.strictEqual( shouldAllowCollaboratorWithLimit( wss, null, 10 ), false );
	} );

	it( 'rejects a null userId even when unlimited', () => {
		const wss = createMockWss( [] );

		assert.strictEqual( shouldAllowCollaboratorWithLimit( wss, null, -1 ), false );
	} );
} );
