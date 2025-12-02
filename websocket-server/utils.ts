import type { IncomingMessage } from 'node:http';
import type { RawData } from 'ws';

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
