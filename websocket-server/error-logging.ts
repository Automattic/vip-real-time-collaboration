import { errorMonitor, type EventEmitter } from 'node:events';
import { writeSync } from 'node:fs';

function redactCredentials( value: string ): string {
	const secret = process.env.VIP_RTC_WS_AUTH_SECRET;
	const redacted = secret ? value.split( secret ).join( '[REDACTED]' ) : value;
	return redacted
		.replace( /\bBearer\s+\S+/gi, 'Bearer [REDACTED]' )
		.replace( /([?&](?:auth|token|access_token|jwt|authorization)=)[^\s&#]*/gi, '$1[REDACTED]' )
		.replace( /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]' );
}

/** Write one record before a fatal error can terminate the process. */
export function logServerError( level: 'error' | 'fatal', event: string, error: unknown ): void {
	try {
		// Do not serialize arbitrary error properties: they can contain requests or tokens.
		const details =
			error instanceof Error
				? {
						name: redactCredentials( error.name ),
						message: redactCredentials( error.message ),
						stack: error.stack ? redactCredentials( error.stack ) : undefined,
				  }
				: {
						message:
							typeof error === 'string'
								? redactCredentials( error )
								: 'A non-Error value was thrown',
				  };
		writeSync(
			2,
			JSON.stringify( {
				timestamp: new Date().toISOString(),
				level,
				service: 'vip-rtc-websocket-server',
				event,
				pid: process.pid,
				error: details,
			} ) + '\n'
		);
	} catch {
		// Logging must not replace the original exception or prevent its normal handling.
	}
}

export function monitorServerErrors(
	server: EventEmitter,
	component: 'http' | 'websocket' | 'metrics'
): void {
	// An ordinary 'error' listener would consume errors that currently crash the process.
	server.on( errorMonitor, ( error: unknown ) => {
		logServerError( 'error', `${ component }_server_error`, error );
	} );
}
