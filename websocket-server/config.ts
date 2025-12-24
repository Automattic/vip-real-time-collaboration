export const DEFAULT_CONNECTION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours in ms
export const DEFAULT_PORT = 1234;
export const DEFAULT_HOST = 'localhost';
export const DEFAULT_MAX_CONNECTIONS = 1500;
export const DEFAULT_BUFFER_CONNECTIONS = 50;

export const JWT_SECRET = process.env.VIP_RTC_WS_AUTH_SECRET ?? '';
export const MAX_CONNECTIONS =
	parseInt( process.env.VIP_RTC_WS_MAX_CONNECTIONS || '', 10 ) || DEFAULT_MAX_CONNECTIONS;
export const BUFFER_CONNECTIONS =
	parseInt( process.env.VIP_RTC_WS_BUFFER_CONNECTIONS || '', 10 ) || DEFAULT_BUFFER_CONNECTIONS;

export const WEBSOCKET_CLOSE_CODES: Map< number, string > = new Map( [
	[ 4001, 'Connection timed out. Reconnect.' ],
	[ 4002, 'Server connection limit reached. Please try again later.' ],
] );

if ( ! JWT_SECRET ) {
	// eslint-disable-next-line no-console
	console.error( 'VIP_RTC_WS_AUTH_SECRET environment variable is not set' );
	process.exit( 1 );
}
