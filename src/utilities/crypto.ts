import { isDevelopment } from '@/utilities/config';
import { Logger } from '@/utilities/logger';

import type * as SHA256 from 'fast-sha256';

const logger = new Logger( 'vip-rtc-crypto' );

function arrayBufferToHex( arrayBuffer: ArrayBuffer, hashBase = 16 ): string {
	const hashArray = Array.from( new Uint8Array( arrayBuffer ) ); // convert buffer to byte array
	const hash = hashArray.map( buf => buf.toString( hashBase ).padStart( 2, '0' ) ).join( '' ); // convert bytes to string
	return hash;
}

/**
 * Creates a hash of the given message using the specified algorithm.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest#examples
 */
export async function generateHash(
	message: string,
	algorithm: AlgorithmIdentifier,
	hashBase = 16
): Promise< string > {
	const msgUint8 = new TextEncoder().encode( message ); // encode as (utf-8) Uint8Array

	if ( window.isSecureContext ) {
		const hashBuffer = await window.crypto.subtle.digest( algorithm, msgUint8 );
		return arrayBufferToHex( hashBuffer, hashBase );
	}

	// Fallback for when crypto.subtle is not available.
	if ( isDevelopment() ) {
		logger.warn( 'Using fallback hash function in non-secure context.' );

		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const sha256 = require( 'fast-sha256' ) as typeof SHA256;

		const hasher = new sha256.Hash();
		hasher.update( msgUint8 );
		return arrayBufferToHex( hasher.digest(), hashBase );
	}

	throw new Error( 'Unable to generate hash outside of secure context in non-development mode!' );
}

/**
 * Generate a UUID.
 *
 * Uses window.crypto.randomUUID if available, otherwise falls back to a
 * custom implementation.
 *
 * @returns A UUID.
 */
export function generateUUID(): string {
	if ( window.isSecureContext ) {
		return window.crypto.randomUUID();
	}

	// Fallback for when crypto.randomUUID is not available.
	if ( isDevelopment() ) {
		logger.warn( 'Using fallback UUID function in non-secure context.' );

		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace( /[xy]/g, function ( char ) {
			// eslint-disable-next-line no-bitwise
			const randomValue = ( Math.random() * 16 ) | 0;
			// eslint-disable-next-line no-bitwise
			const value = char === 'x' ? randomValue : ( randomValue & 0x3 ) | 0x8;
			return value.toString( 16 );
		} );
	}

	throw new Error( 'Unable to generate UUID outside of secure context in non-development mode!' );
}
