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
	connection_id: string;
	room_name: string;
	user_id: number;
	username: string;
}

function isSyncTokenPayload( payload: unknown ): payload is SyncTokenPayload {
	return (
		typeof payload === 'object' &&
		payload !== null &&
		'user_id' in payload &&
		'username' in payload &&
		'room_name' in payload &&
		'connection_id' in payload
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

export function getConnectionId( request: IncomingMessage, secret: string ): string | null {
	const searchParams = new URLSearchParams( request.url?.split( '?' )[ 1 ] || '' );
	const authToken = searchParams.get( 'auth' );

	try {
		const jwtPayload = verifyToken( authToken, secret );
		return jwtPayload.connection_id;
	} catch {
		return null;
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
