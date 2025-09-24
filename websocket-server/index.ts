import { setPersistence, setupWSConnection } from '@y/websocket-server/utils';
import http from 'http';
import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';
import {
	recordMessage,
	recordAuthFailure,
	recordConnectionClose,
	createMetricsServer,
	startMetricsMaintenanceLoop,
	getRequestPathname,
	recordConnectionOpen,
} from './metrics';
import { NoopPersistenceProvider } from './noop-persistence-provider';

const jwtSecret = process.env.VIP_RTC_WS_AUTH_SECRET;
if ( ! jwtSecret ) {
	// eslint-disable-next-line no-console
	console.error( 'VIP_RTC_WS_AUTH_SECRET environment variable is not set' );
	process.exit( 1 );
}

/**
 * ------------------------------------------------------------
 * Types
 * ------------------------------------------------------------
 */
interface AuthSuccessResult {
	authenticated: true;
}

interface AuthFailureResult {
	authenticated: false;
	reason: 'missing_token' | 'invalid_token' | 'invalid_payload';
}

type AuthResult = AuthSuccessResult | AuthFailureResult;

interface SyncTokenPayload extends jwt.JwtPayload {
	user_id: number;
	username: string;
	room_name: string;
	connection_id: string;
}

/**
 * ------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------
 */
const WEBSOCKET_CLOSE_CODES = new Map< number, string >( [
	[ 4001, 'Connection timed out. Reconnect.' ],
] );

/**
 * ------------------------------------------------------------
 * Default values
 * ------------------------------------------------------------
 */
const DEFAULT_CONNECTION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours in ms
const DEFAULT_PORT = 1234;
const DEFAULT_HOST = 'localhost';
const DEFAULT_METRICS_PORT = 9090;

/**
 * ------------------------------------------------------------
 * Constants with overrides from environment variables
 * ------------------------------------------------------------
 */
const wss = new WebSocketServer( { noServer: true } );
const host = process.env.HOST || DEFAULT_HOST;
const port = parseInt( process.env.PORT || '', 10 ) || DEFAULT_PORT;
const metricsPort = parseInt( process.env.METRICS_PORT || '', 10 ) || DEFAULT_METRICS_PORT;
const connectionTimeout =
	parseInt( process.env.CONNECTION_TIMEOUT || '', 10 ) || DEFAULT_CONNECTION_TIMEOUT;

/**
 * ------------------------------------------------------------
 * Helper functions
 * ------------------------------------------------------------
 */

function isSyncTokenPayload( payload: unknown ): payload is SyncTokenPayload {
	return (
		typeof payload === 'object' &&
		payload !== null &&
		'user_id' in payload &&
		'username' in payload &&
		'room_name' in payload &&
		'connection_id' in payload
	);
}

function verifyToken( token: string ): SyncTokenPayload {
	if ( ! jwtSecret ) {
		// Just to appease the type checker. Won't happen due to null check above.
		throw new Error( 'JWT secret not configured' );
	}
	const jwtPayload = jwt.verify( token, jwtSecret );
	if ( ! isSyncTokenPayload( jwtPayload ) ) {
		throw new Error( 'Invalid JWT payload' );
	}
	return jwtPayload;
}

function getConnectionId( request: http.IncomingMessage ): string | null {
	const searchParams = new URLSearchParams( request.url?.split( '?' )[ 1 ] || '' );
	const authToken = searchParams.get( 'auth' );
	if ( ! authToken ) {
		return null;
	}

	try {
		const jwtPayload = verifyToken( authToken );
		return jwtPayload.connection_id;
	} catch {
		return null;
	}
}

/**
 * Verify that the room_name in the JWT payload matches with the request URL
 * to guard against a token being used for the different sync object that it was issued for.
 *
 * TODO: Add additonal check for user_id
 */
function validateTokenPayload( request: http.IncomingMessage, jwtPayload: SyncTokenPayload ) {
	// Extract room name from token and URL, stripping leading slash and _ws/ prefix from URL path
	const { room_name: roomNameFromToken } = jwtPayload;
	const pathname = getRequestPathname( request );
	const roomNameFromUrl = pathname.replace( /^\/(_ws\/)?/, '' );

	const isValid = roomNameFromToken === roomNameFromUrl;
	if ( ! isValid ) {
		// eslint-disable-next-line no-console
		console.error(
			`JWT decoded successfully but token payload is invalid: ${ JSON.stringify( {
				roomNameFromToken,
				roomNameFromUrl,
			} ) }`
		);
		return false;
	}
	return true;
}

function isRequestAuthenticated( request: http.IncomingMessage ): AuthResult {
	const searchParams = new URLSearchParams( request.url?.split( '?' )[ 1 ] || '' );
	const authToken = searchParams.get( 'auth' );

	if ( ! authToken ) {
		return { authenticated: false, reason: 'missing_token' };
	}

	try {
		const jwtPayload = verifyToken( authToken );
		const isValid = validateTokenPayload( request, jwtPayload );
		if ( ! isValid ) {
			return { authenticated: false, reason: 'invalid_payload' };
		}
		return { authenticated: true };
	} catch ( error ) {
		return { authenticated: false, reason: 'invalid_token' };
	}
}

/**
 * ------------------------------------------------------------
 * Server Configuration
 * ------------------------------------------------------------
 */
const server = http.createServer( async ( request, response ) => {
	const pathname = getRequestPathname( request );

	if ( [ '/cache-healthcheck', '/health', '/ready' ].includes( pathname ) ) {
		/**
		 * Used by k8s for LivenessProbe and ReadinessProbe
		 */
		response.writeHead( 200, { 'Content-Type': 'text/plain' } );
		response.end( 'OK' );
		return;
	}

	/**
	 * Return 404 for unknown paths
	 */
	response.writeHead( 404, { 'Content-Type': 'text/plain' } );
	response.end( 'Not Found' );
} );

const metricsServer = createMetricsServer();

const noopPersistence = new NoopPersistenceProvider();
setPersistence( {
	bindState: ( docName, yDoc ) => noopPersistence.bindState( docName, yDoc ),
	writeState: ( docName, yDoc ) => noopPersistence.writeState( docName, yDoc ),
	provider: noopPersistence,
} );

/**
 * ------------------------------------------------------------
 * WebSocket connection handling
 * ------------------------------------------------------------
 */
wss.on( 'connection', ( ws, request ) => {
	const connectionStartTime = Date.now();
	const connectionId = getConnectionId( request );

	/**
	 * Set up the connection
	 */
	setupWSConnection( ws, request );

	recordConnectionOpen( connectionId );

	/**
	 * Track message metrics
	 */
	ws.on( 'message', ( data, isBinary ) => {
		recordMessage( data, isBinary );
	} );

	/**
	 * Disconnect after some time to force a reconnect
	 * with new auth token
	 */
	const timeout = setTimeout( () => {
		// 4001 - custom close code for connection timeout
		ws.close( 4001, WEBSOCKET_CLOSE_CODES.get( 4001 ) );
	}, connectionTimeout );

	/**
	 * Clear timeout and update metrics when connection closes
	 */
	ws.on( 'close', code => {
		clearTimeout( timeout );
		recordConnectionClose( code, connectionStartTime, connectionId );
	} );
} );

server.on( 'upgrade', ( request, socket, head ) => {
	/**
	 * Verify authentication before establishing WebSocket connection
	 */
	const authResult = isRequestAuthenticated( request );
	if ( authResult.authenticated === false ) {
		recordAuthFailure( authResult.reason );
		socket.write( 'HTTP/1.1 401 Unauthorized\r\n\r\n' );
		socket.destroy();
		return;
	}

	wss.handleUpgrade( request, socket, head, ws => {
		wss.emit( 'connection', ws, request );
	} );
} );

/**
 * ------------------------------------------------------------
 * Server start
 * ------------------------------------------------------------
 */
server.listen( port, host, () => {
	// eslint-disable-next-line no-console
	console.log( `WebSocket server running at ws://${ host }:${ port }` );
} );

metricsServer.listen( metricsPort, host, () => {
	// eslint-disable-next-line no-console
	console.log( `WebSocket metrics server running at http://${ host }:${ metricsPort }` );

	startMetricsMaintenanceLoop( wss );
} );
