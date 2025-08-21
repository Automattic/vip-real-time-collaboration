/**
 * Generate a UUID.
 *
 * Uses window.crypto.randomUUID if available, otherwise falls back to a
 * custom implementation.
 *
 * @returns A UUID.
 */
export function generateUUID(): string {
	if ( window.crypto?.randomUUID && typeof window.crypto.randomUUID === 'function' ) {
		return window.crypto.randomUUID();
	}

	// Fallback for when crypto.randomUUID is not available.
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace( /[xy]/g, function ( char ) {
		// eslint-disable-next-line no-bitwise
		const randomValue = ( Math.random() * 16 ) | 0;
		// eslint-disable-next-line no-bitwise
		const value = char === 'x' ? randomValue : ( randomValue & 0x3 ) | 0x8;
		return value.toString( 16 );
	} );
}
