import { type JwtPayload } from 'jsonwebtoken';

import { getRequestPathname, verifyJwtToken } from './utils';

import type { IncomingMessage } from 'node:http';

interface AuthSuccessResult {
	authenticated: true;
	grant: SyncTokenPayload;
}

interface AuthFailureResult {
	authenticated: false;
	reason: 'missing_token' | 'invalid_token';
}

export interface SyncTokenPayload extends JwtPayload {
	blog_id: number;
	connection_id?: string; // @deprecated
	room_name: string;
	user_id: number;
	username: string;
	wp_client_id?: string;
}

function isSyncTokenPayload( payload: unknown ): payload is SyncTokenPayload {
	if ( typeof payload !== 'object' || payload === null ) {
		return false;
	}

	const obj = payload as Record< string, unknown >;
	const hasValidWpClientId = obj.wp_client_id === undefined || typeof obj.wp_client_id === 'string';
	const hasValidConnectionId =
		obj.connection_id === undefined || typeof obj.connection_id === 'string';

	return (
		typeof obj.blog_id === 'number' &&
		typeof obj.user_id === 'number' &&
		typeof obj.username === 'string' &&
		typeof obj.room_name === 'string' &&
		obj.room_name.length > 0 &&
		hasValidWpClientId &&
		hasValidConnectionId &&
		( typeof obj.wp_client_id === 'string' || typeof obj.connection_id === 'string' )
	);
}

function verifyToken(
	token: string | null | undefined,
	secret: string,
	ignoreExpiration = false
): SyncTokenPayload {
	if ( ! token ) {
		throw new Error( 'Missing token' );
	}

	const jwtPayload = verifyJwtToken( token, secret, {
		algorithms: [ 'HS256' ],
		...( ignoreExpiration ? { ignoreExpiration: true } : {} ),
	} );
	if ( ! isSyncTokenPayload( jwtPayload ) ) {
		throw new Error( 'Invalid JWT payload' );
	}

	return jwtPayload;
}

export function verifyTokenGrant( token: string, secret: string ): SyncTokenPayload {
	return verifyToken( token, secret );
}

export function verifyTokenGrantIgnoringExpiration(
	token: string,
	secret: string
): SyncTokenPayload {
	return verifyToken( token, secret, true );
}

export function validateLegacyRoomPath(
	request: IncomingMessage,
	jwtPayload: SyncTokenPayload
): boolean {
	const pathname = getRequestPathname( request );
	if ( pathname === '/' || pathname === '/_ws' ) {
		return false;
	}

	const roomNameFromUrl = pathname.startsWith( '/_ws/' )
		? pathname.slice( '/_ws/'.length )
		: pathname.slice( 1 );
	return jwtPayload.room_name === roomNameFromUrl;
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
		return { authenticated: true, grant: jwtPayload };
	} catch {
		return { authenticated: false, reason: 'invalid_token' };
	}
}
