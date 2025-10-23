import { isDevelopment } from '@/utilities/config';
import { Logger } from '@/utilities/logger';

const logger = new Logger( 'crypto' );

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
