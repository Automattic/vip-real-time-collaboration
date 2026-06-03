export const DEFAULT_CONNECTION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours in ms
export const DEFAULT_PORT = 1234;
export const DEFAULT_HOST = 'localhost';
export const DEFAULT_MAX_CONNECTIONS = 1500;
export const DEFAULT_BUFFER_CONNECTIONS = 50;
export const DEFAULT_MAX_COLLABORATORS = 300;

function parseIntFromEnv( envValue: string | undefined, defaultValue: number ): number {
	const parsed = parseInt( envValue || '', 10 );
	return Number.isNaN( parsed ) ? defaultValue : parsed;
}

export const JWT_SECRET = process.env.VIP_RTC_WS_AUTH_SECRET ?? '';
export const MAX_CONNECTIONS = parseIntFromEnv(
	process.env.VIP_RTC_WS_MAX_CONNECTIONS,
	DEFAULT_MAX_CONNECTIONS
);
export const BUFFER_CONNECTIONS = parseIntFromEnv(
	process.env.VIP_RTC_WS_BUFFER_CONNECTIONS,
	DEFAULT_BUFFER_CONNECTIONS
);
export const MAX_COLLABORATORS = parseIntFromEnv(
	process.env.VIP_RTC_WS_MAX_COLLABORATORS,
	DEFAULT_MAX_COLLABORATORS
);

export const WEBSOCKET_CLOSE_CODES: Map< number, string > = new Map( [
	[ 4001, 'Connection timed out. Reconnect.' ],
	[ 4002, 'Server connection limit reached. Please try again later.' ],
	[ 4003, 'Collaborator limit reached for this environment. Please try again later.' ],
] );
