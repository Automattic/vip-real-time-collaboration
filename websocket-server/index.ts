import { setupWSConnection } from '@y/websocket-server/utils';
import http from 'http';
import { WebSocketServer } from 'ws';

/**
 * This is a simple WebSocket server intended for local development of this
 * plugin. It is not (yet) intended for production use. It is not currently
 * hot-reloaded, so you will need to re-run `npm run dev` if you change the code.
 */

const wss = new WebSocketServer( { noServer: true } );
const host = process.env.HOST ?? 'localhost';
const port = parseInt( process.env.PORT ?? '1234', 10 );

const server = http.createServer( ( _request, response ) => {
	response.writeHead( 200, { 'Content-Type': 'text/plain' } );
	response.end( 'okay' );
} );

wss.on( 'connection', setupWSConnection );

server.on( 'upgrade', ( request, socket, head ) => {
	// @TODO DANGER: Missing authorization checks!!!
	// See https://github.com/websockets/ws#client-authentication
	wss.handleUpgrade( request, socket, head, ws => {
		wss.emit( 'connection', ws, request );
	} );
} );

server.listen( port, host, () => {
	// eslint-disable-next-line no-console
	console.log( `WebSocketServer running at ws://${ host }:${ port }` );
} );
