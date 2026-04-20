import jwt, { type SignOptions } from 'jsonwebtoken';
import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, Mock, mock } from 'node:test';

import {
	getTokenIdentity,
	getWpClientId,
	isRequestAuthenticated,
	type SyncTokenPayload,
} from './auth';

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
			wp_client_id: 'conn-123',
			room_name: 'test-room',
			user_id: 42,
			username: 'testuser',
			...payload,
		},
		MOCK_JWT_SECRET,
		options
	);
}

describe( 'getWpClientId', () => {
	it( 'should return wp_client_id from valid token', () => {
		const token = createValidToken( { wp_client_id: 'conn-456' } );
		const request = createRequest( `/test-room?auth=${ token }` );
		assert.strictEqual( getWpClientId( request, MOCK_JWT_SECRET ), 'conn-456' );
	} );

	it( 'should return connection_id from valid token when wp_client_id is not present', () => {
		const token = createValidToken( { connection_id: 'conn-789', wp_client_id: undefined } );
		const request = createRequest( `/test-room?auth=${ token }` );
		assert.strictEqual( getWpClientId( request, MOCK_JWT_SECRET ), 'conn-789' );
	} );

	it( 'should prefer wp_client_id over connection_id when both are present', () => {
		const token = createValidToken( { wp_client_id: 'wp-id', connection_id: 'conn-id' } );
		const request = createRequest( `/test-room?auth=${ token }` );
		assert.strictEqual( getWpClientId( request, MOCK_JWT_SECRET ), 'wp-id' );
	} );

	it( 'should return null when token is missing', () => {
		const request = createRequest( '/test-room' );
		assert.strictEqual( getWpClientId( request, MOCK_JWT_SECRET ), null );
	} );

	it( 'should return null for invalid token', () => {
		const request = createRequest( '/test-room?auth=invalid-token' );
		assert.strictEqual( getWpClientId( request, MOCK_JWT_SECRET ), null );
	} );

	it( 'should return null for token with wrong secret', () => {
		const token = createValidToken( {} );
		const request = createRequest( `/test-room?auth=${ token }` );
		assert.strictEqual( getWpClientId( request, 'wrong-secret' ), null );
	} );

	it( 'should return null for expired token', () => {
		const token = createValidToken( {
			exp: EXPIRED_TIMESTAMP,
		} );
		const request = createRequest( `/test-room?auth=${ token }` );
		assert.strictEqual( getWpClientId( request, MOCK_JWT_SECRET ), null );
	} );

	it( 'should handle request with no URL', () => {
		const request = createRequest();
		assert.strictEqual( getWpClientId( request, MOCK_JWT_SECRET ), null );
	} );
} );

describe( 'getTokenIdentity', () => {
	it( 'should return wpClientId and userId from a valid token', () => {
		const token = createValidToken( { wp_client_id: 'client-1', user_id: 99 } );
		const request = createRequest( `/test-room?auth=${ token }` );
		assert.deepStrictEqual( getTokenIdentity( request, MOCK_JWT_SECRET ), {
			wpClientId: 'client-1',
			userId: 99,
		} );
	} );

	it( 'should fall back to connection_id when wp_client_id is missing', () => {
		const token = createValidToken( { connection_id: 'legacy', wp_client_id: undefined } );
		const request = createRequest( `/test-room?auth=${ token }` );
		assert.deepStrictEqual( getTokenIdentity( request, MOCK_JWT_SECRET ), {
			wpClientId: 'legacy',
			userId: 42,
		} );
	} );

	it( 'should return nulls for an invalid token', () => {
		const request = createRequest( '/test-room?auth=invalid' );
		assert.deepStrictEqual( getTokenIdentity( request, MOCK_JWT_SECRET ), {
			wpClientId: null,
			userId: null,
		} );
	} );

	it( 'should return nulls when auth is missing', () => {
		const request = createRequest( '/test-room' );
		assert.deepStrictEqual( getTokenIdentity( request, MOCK_JWT_SECRET ), {
			wpClientId: null,
			userId: null,
		} );
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

	it( 'should return authenticated true for valid token with connection_id instead of wp_client_id', () => {
		const token = createValidToken( { connection_id: 'conn-123', wp_client_id: undefined } );
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

	it( 'should return invalid_token_payload when room names do not match', () => {
		const token = createValidToken( { room_name: 'other-room' } );
		const request = createRequest( `/test-room?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, false );
		assert.strictEqual( result.reason, 'invalid_token_payload' );
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

	it( 'should return invalid_token for token missing both connection_id and wp_client_id', () => {
		const token = createValidToken( {
			connection_id: undefined,
			wp_client_id: undefined,
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

	it( 'should reject token where user_id is not a number', () => {
		const token = createValidToken( { user_id: 'not-a-number' as unknown as number } );
		const request = createRequest( `/test-room?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, false );
		assert.strictEqual( result.reason, 'invalid_token' );
	} );

	it( 'should reject token where username is not a string', () => {
		const token = createValidToken( { username: 42 as unknown as string } );
		const request = createRequest( `/test-room?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, false );
		assert.strictEqual( result.reason, 'invalid_token' );
	} );

	it( 'should reject token where wp_client_id is not a string and connection_id is missing', () => {
		const token = createValidToken( {
			wp_client_id: 99 as unknown as string,
			connection_id: undefined,
		} );
		const request = createRequest( `/test-room?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.strictEqual( result.authenticated, false );
		assert.strictEqual( result.reason, 'invalid_token' );
	} );
} );
