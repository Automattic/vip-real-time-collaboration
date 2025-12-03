import jwt, { type Jwt, type JwtPayload, type VerifyOptions } from 'jsonwebtoken';

import type { IncomingMessage } from 'node:http';
import type { RawData } from 'ws';

type WithRequired< T, K extends keyof T > = Omit< T, K > & Required< Pick< T, K > >;

type VerifyOptionsWithAlgorithms = WithRequired< VerifyOptions, 'algorithms' >;

export function getRawDataSizeBytes( data: RawData ): number {
	if ( Array.isArray( data ) ) {
		let total = 0;
		for ( const bufferChunk of data ) {
			total += bufferChunk.length;
		}
		return total;
	}

	if ( Buffer.isBuffer( data ) ) {
		return data.length;
	}

	if ( data instanceof ArrayBuffer ) {
		return data.byteLength;
	}

	return 0;
}

export function getRequestPathname( request: IncomingMessage ): string {
	const pathname = request.url?.split( '?' )[ 0 ] || '/';
	// Remove trailing slashes (except for root path)
	return pathname === '/' ? pathname : pathname.replace( /\/+$/, '' );
}

/**
 * Safely verify a JWT token with required algorithm specification.
 *
 * This wrapper enforces that the 'algorithms' parameter is always provided,
 * preventing algorithm confusion attacks where an attacker could manipulate
 * the algorithm in the JWT header to bypass signature verification.
 *
 * @param token - The JWT token to verify
 * @param secret - The secret key used to verify the token
 * @param options - Verification options with REQUIRED algorithms field
 * @returns The decoded JWT payload
 */
export function verifyJwtToken(
	token: string,
	secret: string,
	options: VerifyOptionsWithAlgorithms
): JwtPayload | Jwt | string {
	return jwt.verify( token, secret, options );
}
