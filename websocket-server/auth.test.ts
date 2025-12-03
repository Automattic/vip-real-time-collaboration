import jwt, { type SignOptions } from 'jsonwebtoken';
import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, Mock, mock } from 'node:test';

import { getConnectionId, isRequestAuthenticated, type SyncTokenPayload } from './auth';

import type { IncomingMessage } from 'node:http';

const MOCK_JWT_SECRET = 'mock-jwt-secret';
const EXPIRED_TIMESTAMP = Math.floor( Date.now() / 1000 ) - 3600; // 1 hour ago

function createRequest( url?: string ): IncomingMessage {
	return { url } as IncomingMessage;
}

function createValidToken(
	payload: Partial< SyncTokenPayload > = {},
	options: SignOptions = {}
): string {
	return jwt.sign(
		{
			connection_id: 'conn-123',
			room_name: 'test-room',
			user_id: 42,
			username: 'testuser',
			...payload,
		},
		MOCK_JWT_SECRET,
		options
	);
}

describe( 'getConnectionId', () => {
	it( 'should return connection_id from valid token', () => {
		const token = createValidToken( { connection_id: 'conn-456' } );
		const request = createRequest( `/test-room?auth=${ token }` );
		assert.strictEqual( getConnectionId( request, MOCK_JWT_SECRET ), 'conn-456' );
	} );

	it( 'should return null when token is missing', () => {
		const request = createRequest( '/test-room' );
		assert.strictEqual( getConnectionId( request, MOCK_JWT_SECRET ), null );
	} );

	it( 'should return null for invalid token', () => {
		const request = createRequest( '/test-room?auth=invalid-token' );
		assert.strictEqual( getConnectionId( request, MOCK_JWT_SECRET ), null );
	} );

	it( 'should return null for token with wrong secret', () => {
		const token = createValidToken( {} );
		const request = createRequest( `/test-room?auth=${ token }` );
		assert.strictEqual( getConnectionId( request, 'wrong-secret' ), null );
	} );

	it( 'should return null for expired token', () => {
		const token = createValidToken( {
			exp: EXPIRED_TIMESTAMP,
		} );
		const request = createRequest( `/test-room?auth=${ token }` );
		assert.strictEqual( getConnectionId( request, MOCK_JWT_SECRET ), null );
	} );

	it( 'should handle request with no URL', () => {
		const request = createRequest();
		assert.strictEqual( getConnectionId( request, MOCK_JWT_SECRET ), null );
	} );
} );

describe( 'isRequestAuthenticated', () => {
	let mockConsoleError: Mock< typeof console.error >;

	beforeEach( () => {
		mockConsoleError = mock.method( console, 'error', () => {} );
	} );

	afterEach( () => {
		mock.restoreAll();
	} );

	it( 'should return authenticated true for valid token and matching room', () => {
		const token = createValidToken();
		const request = createRequest( `/test-room?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, true );
	} );

	it( 'should return authenticated true with _ws/ prefix in URL', () => {
		const token = createValidToken();
		const request = createRequest( `/_ws/test-room?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, true );
	} );

	it( 'should return missing_token when auth param is absent', () => {
		const request = createRequest( '/test-room' );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, false );
		assert.strictEqual( result.reason, 'missing_token' );
	} );

	it( 'should return invalid_token for malformed token', () => {
		const request = createRequest( '/test-room?auth=invalid-token' );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, false );
		assert.strictEqual( result.reason, 'invalid_token' );
	} );

	it( 'should return invalid_token for token with wrong secret', () => {
		const token = createValidToken();
		const request = createRequest( `/test-room?auth=${ token }` );
		const result = isRequestAuthenticated( request, 'wrong-secret' );
		assert.strictEqual( result.authenticated, false );
		assert.strictEqual( result.reason, 'invalid_token' );
	} );

	it( 'should return invalid_payload when room names do not match', () => {
		const token = createValidToken( { room_name: 'other-room' } );
		const request = createRequest( `/test-room?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, false );
		assert.strictEqual( result.reason, 'invalid_payload' );
		assert.strictEqual( mockConsoleError.mock.calls.length, 1 );
	} );

	it( 'should return invalid_token for expired token', () => {
		const token = createValidToken( {
			exp: EXPIRED_TIMESTAMP,
		} );
		const request = createRequest( `/test-room?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, false );
		assert.strictEqual( result.reason, 'invalid_token' );
	} );

	it( 'should return invalid_token for token missing required fields', () => {
		const token = createValidToken( {
			room_name: undefined,
			user_id: undefined,
			username: undefined,
		} );
		const request = createRequest( `/test-room?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, false );
		assert.strictEqual( result.reason, 'invalid_token' );
	} );

	it( 'should handle URLs with trailing slashes', () => {
		const token = createValidToken();
		const request = createRequest( `/test-room/?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, true );
	} );

	it( 'should handle complex room names with slashes', () => {
		const token = createValidToken( { room_name: 'site/123/post/456' } );
		const request = createRequest( `/site/123/post/456?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, true );
	} );

	it( 'should handle complex room names with _ws/ prefix', () => {
		const token = createValidToken( { room_name: 'site/123/post/456' } );
		const request = createRequest( `/_ws/site/123/post/456?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, true );
	} );

	it( 'should reject token signed with wrong algorithm', () => {
		// Create a token using HS512 instead of HS256
		const token = createValidToken( {}, { algorithm: 'HS512' } );
		const request = createRequest( `/test-room?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, false );
		assert.strictEqual( result.reason, 'invalid_token' );
	} );

	it( 'should reject token with "none" algorithm', () => {
		const token = createValidToken( {}, { algorithm: 'none' } );
		const request = createRequest( `/test-room?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, false );
		assert.strictEqual( result.reason, 'invalid_token' );
	} );
} );
