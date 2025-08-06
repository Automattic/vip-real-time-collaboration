import { setupWSConnection } from '@y/websocket-server/utils';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Duplex } from 'stream';
import { WebSocketServer } from 'ws';

/**
 * This is a simple WebSocket server intended for local development of this
 * plugin. It is not (yet) intended for production use. It is not currently
 * hot-reloaded, so you will need to re-run `npm run dev` if you change the code.
 */

const DEFAULT_CONNECTION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours in ms
const DEFAULT_PORT = 1234;
const DEFAULT_HOST = 'localhost';

const jwtSecret = process.env.VIP_RTC_WS_AUTH_SECRET;
if ( ! jwtSecret ) {
	// eslint-disable-next-line no-console
	console.error( 'VIP_RTC_WS_AUTH_SECRET environment variable is not set' );
	process.exit( 1 );
}

const wss = new WebSocketServer( { noServer: true } );
const host = process.env.HOST || DEFAULT_HOST;
/**
 * Fallback '' (empty string) to avoid parseInt( undefined ) type error
 */
const port = parseInt( process.env.PORT || '', 10 ) || DEFAULT_PORT;
const connectionTimeout =
	parseInt( process.env.CONNECTION_TIMEOUT || '', 10 ) || DEFAULT_CONNECTION_TIMEOUT;

interface SyncTokenPayload extends jwt.JwtPayload {
	user_id: number;
	username: string;
	entity_type: string;
	entity_id: string;
}

function isSyncTokenPayload( payload: unknown ): payload is SyncTokenPayload {
	return (
		typeof payload === 'object' &&
		payload !== null &&
		'user_id' in payload &&
		'username' in payload &&
		'entity_type' in payload &&
		'entity_id' in payload
	);
}

function verifyToken( token: string ): SyncTokenPayload {
	if ( ! jwtSecret ) {
		/**
		 * Just to appease the type checker. Won't happen due to null check above.
		 */
		throw new Error( 'JWT secret not configured' );
	}
	const jwtPayload = jwt.verify( token, jwtSecret );
	if ( ! isSyncTokenPayload( jwtPayload ) ) {
		throw new Error( 'Invalid JWT payload' );
	}
	return jwtPayload;
}

/**
 * Verify that the entity_type and entity_id in the JWT payload matches with the request URL
 * to guard against a token being used for the different entity's session that it was issued for.
 *
 * TODO: Add additonal check for user_id
 */
function validateTokenPayload( request: http.IncomingMessage, jwtPayload: SyncTokenPayload ) {
	const { entity_type: entityType, entity_id: entityId } = jwtPayload;
	const urlPath = request.url?.split( '?' )[ 0 ];

	const roomNameFromToken = `${ entityType }-${ entityId }`;
	const roomNameFromUrl = urlPath?.replace( /^\//, '' );

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

function isRequestAuthenticated( request: http.IncomingMessage, socket: Duplex ): boolean {
	const searchParams = new URLSearchParams( request.url?.split( '?' )[ 1 ] || '' );
	const authToken = searchParams.get( 'auth' );

	if ( ! authToken ) {
		socket.write( 'HTTP/1.1 401 Unauthorized\r\n\r\n' );
		socket.destroy();
		return false;
	}

	try {
		const jwtPayload = verifyToken( authToken );
		const isValid = validateTokenPayload( request, jwtPayload );
		if ( ! isValid ) {
			socket.write( 'HTTP/1.1 401 Unauthorized\r\n\r\n' );
			socket.destroy();
			return false;
		}
		return true;
	} catch ( error ) {
		socket.write( 'HTTP/1.1 401 Unauthorized\r\n\r\n' );
		socket.destroy();
		return false;
	}
}

const server = http.createServer( ( _request, response ) => {
	response.writeHead( 200, { 'Content-Type': 'text/plain' } );
	response.end( 'okay' );
} );

wss.on( 'connection', ( ws, request ) => {
	/**
	 * Set up the connection
	 */
	setupWSConnection( ws, request );

	/**
	 * Disconnect after some time to force a reconnect
	 * with new auth token
	 */
	const timeout = setTimeout( () => {
		ws.close( 1000, 'Connection timed out. Reconnect.' );
	}, connectionTimeout );

	/**
	 * Clear timeout if connection closes before timeout
	 */
	ws.on( 'close', () => {
		clearTimeout( timeout );
	} );
} );

server.on( 'upgrade', ( request, socket, head ) => {
	/**
	 * Verify authentication before establishing WebSocket connection
	 */
	if ( ! isRequestAuthenticated( request, socket ) ) {
		/**
		 * Authentication failed, connection already rejected in isRequestAuthenticated
		 */
		return;
	}

	wss.handleUpgrade( request, socket, head, ws => {
		wss.emit( 'connection', ws, request );
	} );
} );

server.listen( port, host, () => {
	// eslint-disable-next-line no-console
	console.log( `WebSocketServer running at ws://${ host }:${ port }` );
} );
