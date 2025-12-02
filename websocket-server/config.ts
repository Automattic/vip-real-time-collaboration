export const DEFAULT_CONNECTION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours in ms
export const DEFAULT_PORT = 1234;
export const DEFAULT_HOST = 'localhost';

export const JWT_SECRET = process.env.VIP_RTC_WS_AUTH_SECRET ?? '';

export const WEBSOCKET_CLOSE_CODES: Map< number, string > = new Map( [
	[ 4001, 'Connection timed out. Reconnect.' ],
] );

if ( ! JWT_SECRET ) {
	// eslint-disable-next-line no-console
	console.error( 'VIP_RTC_WS_AUTH_SECRET environment variable is not set' );
	process.exit( 1 );
}
