import { type JwtPayload } from 'jsonwebtoken';

import { getRequestPathname, verifyJwtToken } from './utils';

import type { IncomingMessage } from 'node:http';

interface AuthSuccessResult {
	authenticated: true;
}

interface AuthFailureResult {
	authenticated: false;
	reason: 'missing_token' | 'invalid_token' | 'invalid_token_payload';
}

export interface SyncTokenPayload extends JwtPayload {
	connection_id?: string; // @deprecated
	room_name: string;
	user_id: number;
	username: string;
	wp_client_id: string;
}

export interface SessionTokenPayload extends JwtPayload {
	user_id: number;
	username: string;
	blog_id: number;
	wp_client_id: string;
	token_type: 'session';
}

function isSyncTokenPayload( payload: unknown ): payload is SyncTokenPayload {
	return (
		typeof payload === 'object' &&
		payload !== null &&
		'user_id' in payload &&
		'username' in payload &&
		'room_name' in payload &&
		( 'connection_id' in payload || 'wp_client_id' in payload )
	);
}

function isSessionTokenPayload( payload: unknown ): payload is SessionTokenPayload {
	return (
		typeof payload === 'object' &&
		payload !== null &&
		'user_id' in payload &&
		'username' in payload &&
		'wp_client_id' in payload &&
		'token_type' in payload &&
		( payload as Record< string, unknown > ).token_type === 'session'
	);
}

function verifyToken( token: string | null | undefined, secret: string ): SyncTokenPayload {
	if ( ! token ) {
		throw new Error( 'Missing token' );
	}

	const jwtPayload = verifyJwtToken( token, secret, { algorithms: [ 'HS256' ] } );
	if ( ! isSyncTokenPayload( jwtPayload ) ) {
		throw new Error( 'Invalid JWT payload' );
	}

	return jwtPayload;
}

/**
 * Verify that the room_name in the JWT payload matches with the request URL
 * to guard against a token being used for the different sync object that it was issued for.
 *
 * TODO: Add additonal check for user_id
 */
function validateTokenPayload( request: IncomingMessage, jwtPayload: SyncTokenPayload ): boolean {
	// Extract room name from token and URL, stripping leading slash and _ws/ prefix from URL path
	const { room_name: roomNameFromToken } = jwtPayload;
	const pathname = getRequestPathname( request );
	const roomNameFromUrl = pathname.replace( /^\/(_ws\/)?/, '' );

	const isValid = roomNameFromToken === roomNameFromUrl;
	if ( ! isValid ) {
		// eslint-disable-next-line no-console
		console.error(
			`JWT decoded successfully but token payload is invalid: ${ JSON.stringify( {
				roomNameFromToken,
				roomNameFromUrl,
			} ) }`
		);
		return false;
	}
	return true;
}

export function getWpClientId( request: IncomingMessage, secret: string ): string | null {
	const searchParams = new URLSearchParams( request.url?.split( '?' )[ 1 ] || '' );
	const authToken = searchParams.get( 'auth' );

	try {
		const jwtPayload = verifyToken( authToken, secret );
		return jwtPayload.wp_client_id ?? jwtPayload.connection_id;
	} catch {
		return null;
	}
}

/**
 * Verify a session-level JWT for multiplexed WebSocket connections.
 * Session tokens prove user identity but do not bind to a specific room.
 */
export function isSessionAuthenticated(
	request: IncomingMessage,
	secret: string
): { authenticated: true; payload: SessionTokenPayload } | AuthFailureResult {
	const searchParams = new URLSearchParams( request.url?.split( '?' )[ 1 ] || '' );
	const authToken = searchParams.get( 'auth' );

	if ( ! authToken ) {
		return { authenticated: false, reason: 'missing_token' };
	}

	try {
		const jwtPayload = verifyJwtToken( authToken, secret, { algorithms: [ 'HS256' ] } );
		if ( ! isSessionTokenPayload( jwtPayload ) ) {
			return { authenticated: false, reason: 'invalid_token_payload' };
		}
		return { authenticated: true, payload: jwtPayload };
	} catch {
		return { authenticated: false, reason: 'invalid_token' };
	}
}

/**
 * Verify a per-room JWT token. Used during room:join on multiplexed connections.
 * Validates the token signature and checks the room_name claim matches the requested room.
 */
export function verifyRoomToken(
	token: string,
	room: string,
	secret: string
): { valid: true; payload: SyncTokenPayload } | { valid: false; reason: string } {
	try {
		const jwtPayload = verifyToken( token, secret );

		if ( jwtPayload.room_name !== room ) {
			return { valid: false, reason: 'room_name_mismatch' };
		}

		return { valid: true, payload: jwtPayload };
	} catch {
		return { valid: false, reason: 'invalid_token' };
	}
}

export function isRequestAuthenticated(
	request: IncomingMessage,
	secret: string
): AuthFailureResult | AuthSuccessResult {
	const searchParams = new URLSearchParams( request.url?.split( '?' )[ 1 ] || '' );
	const authToken = searchParams.get( 'auth' );

	if ( ! authToken ) {
		return { authenticated: false, reason: 'missing_token' };
	}

	try {
		const jwtPayload = verifyToken( authToken, secret );
		const isValid = validateTokenPayload( request, jwtPayload );
		if ( ! isValid ) {
			return { authenticated: false, reason: 'invalid_token_payload' };
		}
		return { authenticated: true };
	} catch {
		return { authenticated: false, reason: 'invalid_token' };
	}
}
