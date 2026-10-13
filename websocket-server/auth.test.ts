import jwt, { type SignOptions } from 'jsonwebtoken';
import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
	isRequestAuthenticated,
	validateLegacyRoomPath,
	verifyTokenGrant,
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
			blog_id: 7,
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

describe( 'verifyTokenGrant', () => {
	it( 'returns the strictly validated grant payload', () => {
		const token = createValidToken( { blog_id: 19, room_name: 'site-19/post-4' } );

		assert.deepStrictEqual(
			{
				blogId: verifyTokenGrant( token, MOCK_JWT_SECRET ).blog_id,
				roomName: verifyTokenGrant( token, MOCK_JWT_SECRET ).room_name,
			},
			{ blogId: 19, roomName: 'site-19/post-4' }
		);
	} );

	it( 'rejects a grant without a numeric blog_id', () => {
		const missingBlogId = createValidToken( { blog_id: undefined } );
		const stringBlogId = createValidToken( { blog_id: '7' as unknown as number } );

		assert.throws(
			() => verifyTokenGrant( missingBlogId, MOCK_JWT_SECRET ),
			/Invalid JWT payload/
		);
		assert.throws( () => verifyTokenGrant( stringBlogId, MOCK_JWT_SECRET ), /Invalid JWT payload/ );
	} );

	it( 'rejects either optional client ID when it is present with a non-string value', () => {
		const invalidPreferredId = createValidToken( {
			connection_id: 'valid-fallback',
			wp_client_id: 7 as unknown as string,
		} );
		const invalidDeprecatedId = createValidToken( {
			connection_id: 7 as unknown as string,
			wp_client_id: 'valid-preferred',
		} );

		assert.throws(
			() => verifyTokenGrant( invalidPreferredId, MOCK_JWT_SECRET ),
			/Invalid JWT payload/
		);
		assert.throws(
			() => verifyTokenGrant( invalidDeprecatedId, MOCK_JWT_SECRET ),
			/Invalid JWT payload/
		);
	} );

	it( 'rejects an empty canonical room_name', () => {
		const token = createValidToken( { room_name: '' } );

		assert.throws( () => verifyTokenGrant( token, MOCK_JWT_SECRET ), /Invalid JWT payload/ );
	} );
} );

describe( 'isRequestAuthenticated', () => {
	it( 'verifies a valid grant independently of the request path', () => {
		const token = createValidToken();
		const request = createRequest( `/unrelated/path?auth=${ token }` );
		const result = isRequestAuthenticated( request, MOCK_JWT_SECRET );
		assert.ok( result.authenticated );
		assert.strictEqual( result.grant.room_name, 'test-room' );
		assert.strictEqual( result.grant.blog_id, 7 );
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

describe( 'validateLegacyRoomPath', () => {
	it( 'accepts exact room paths, including internal slashes and the _ws prefix', () => {
		const payload = verifyTokenGrant(
			createValidToken( { room_name: 'site/123/post/456' } ),
			MOCK_JWT_SECRET
		);

		assert.strictEqual(
			validateLegacyRoomPath( createRequest( '/site/123/post/456' ), payload ),
			true
		);
		assert.strictEqual(
			validateLegacyRoomPath( createRequest( '/_ws/site/123/post/456' ), payload ),
			true
		);
	} );

	it( 'rejects a mismatched or missing legacy room path', () => {
		const payload = verifyTokenGrant( createValidToken(), MOCK_JWT_SECRET );

		assert.strictEqual( validateLegacyRoomPath( createRequest( '/other-room' ), payload ), false );
		assert.strictEqual( validateLegacyRoomPath( createRequest( '/' ), payload ), false );
		assert.strictEqual( validateLegacyRoomPath( createRequest( '/_ws' ), payload ), false );
	} );
} );
