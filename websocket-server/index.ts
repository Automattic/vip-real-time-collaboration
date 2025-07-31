import { setupWSConnection } from '@y/websocket-server/utils';
import http from 'http';
import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';

/**
 * This is a simple WebSocket server intended for local development of this
 * plugin. It is not (yet) intended for production use. It is not currently
 * hot-reloaded, so you will need to re-run `npm run dev` if you change the code.
 */

const DEFAULT_CONNECTION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours
const DEFAULT_PORT = 1234;
const DEFAULT_HOST = 'localhost';
const DEFAULT_JWT_SECRET = 'rtc_websocket_auth_secret';

const wss = new WebSocketServer( { noServer: true } );
const host = process.env.HOST ?? DEFAULT_HOST;
const port = parseInt( process.env.PORT ?? DEFAULT_PORT.toString(), 10 );
const jwtSecret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
const connectionTimeout = parseInt(
	process.env.CONNECTION_TIMEOUT ?? DEFAULT_CONNECTION_TIMEOUT.toString(),
	10
);

interface SyncTokenPayload extends jwt.JwtPayload {
	user_id: number;
	username: string;
	email: string;
	display_name: string;
	entity_type: string;
	entity_id: string;
	room_name: string;
}

const verifyToken = ( token: string ): SyncTokenPayload => {
	const jwtPayload = jwt.verify( token, jwtSecret );
	return jwtPayload as SyncTokenPayload;
};

/**
 * Verify that the roomName in the JWT payload matches with the request URL
 */
const validateTokenPayload = ( request: http.IncomingMessage, jwtPayload: SyncTokenPayload ) => {
	const { room_name: roomName } = jwtPayload;
	const urlPath = request.url?.split( '?' )[ 0 ];

	return urlPath === `/${ roomName }`;
};

const handleAuthentication = (
	request: http.IncomingMessage,
	socket: import('stream').Duplex
): boolean => {
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
			socket.write( 'HTTP/1.1 403 Forbidden\r\n\r\n' );
			socket.destroy();
			return false;
		}
		return true;
	} catch ( error ) {
		socket.write( 'HTTP/1.1 401 Unauthorized\r\n\r\n' );
		socket.destroy();
		return false;
	}
};

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
	if ( ! handleAuthentication( request, socket ) ) {
		/**
		 * Authentication failed, connection already rejected in handleAuthentication
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
