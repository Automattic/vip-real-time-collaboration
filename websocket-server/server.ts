import { setPersistence, setupWSConnection } from '@y/websocket-server/utils';
import http from 'node:http';
import { WebSocketServer } from 'ws';

import { isRequestAuthenticated, validateLegacyRoomPath } from './auth';
import { handleCollectionAwareness, isCollectionRoom } from './collection-awareness';
import { CONNECTION_TIMEOUT_CLOSE, WEBSOCKET_CLOSE_CODES } from './config';
import { shouldAllowCollaborator, shouldAllowConnection } from './connection-limits';
import {
	recordConnectionClose,
	recordConnectionFailure,
	recordConnectionOpen,
	recordMessage,
} from './metrics';
import { MultiplexSession } from './multiplex-session';
import { NoopPersistenceProvider } from './noop-persistence-provider';
import { MULTIPLEX_SUBPROTOCOL } from './protocol';
import './types';
import { getRequestPathname } from './utils';

import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { RawData, WebSocket } from 'ws';

export interface RtcServer {
	server: Server;
	wss: WebSocketServer;
}

interface RtcServerOptions {
	jwtSecret: string;
	connectionTimeout: number;
}

function requestedProtocols( request: IncomingMessage ): string[] {
	const header = request.headers[ 'sec-websocket-protocol' ];
	if ( ! header ) {
		return [];
	}
	return ( Array.isArray( header ) ? header.join( ',' ) : header )
		.split( ',' )
		.map( protocol => protocol.trim() )
		.filter( Boolean );
}

function rejectHttpUpgrade( socket: Duplex, status: '400 Bad Request' | '401 Unauthorized' ): void {
	socket.once( 'finish', () => socket.destroy() );
	socket.end( `HTTP/1.1 ${ status }\r\nConnection: close\r\n\r\n` );
}

type MessageListener = ( data: RawData, isBinary: boolean ) => void;

/**
 * Attach a legacy one-room connection to y-websocket-server. Collection rooms
 * get their y-websocket message listener wrapped so empty awareness renewals
 * are echoed to the sender instead of broadcast (see collection-awareness.ts).
 */
function setupLegacyRoomConnection( ws: WebSocket, request: IncomingMessage, room: string ): void {
	if ( ! isCollectionRoom( room ) ) {
		setupWSConnection( ws, request, { docName: room } );
		return;
	}

	const existingListeners = new Set( ws.listeners( 'message' ) );
	setupWSConnection( ws, request, { docName: room } );
	for ( const listener of ws.listeners( 'message' ) as MessageListener[] ) {
		if ( existingListeners.has( listener ) ) {
			continue;
		}
		ws.off( 'message', listener );
		ws.on( 'message', ( data: RawData, isBinary: boolean ) => {
			// y-websocket-server sets binaryType to 'arraybuffer'.
			if (
				data instanceof ArrayBuffer &&
				handleCollectionAwareness( room, new Uint8Array( data ), echo => ws.send( echo ) )
			) {
				return;
			}
			listener( data, isBinary );
		} );
	}
}

export function createRtcServer( options: RtcServerOptions ): RtcServer {
	const wss = new WebSocketServer( {
		noServer: true,
		handleProtocols: protocols =>
			protocols.has( MULTIPLEX_SUBPROTOCOL ) ? MULTIPLEX_SUBPROTOCOL : false,
	} );
	const server = http.createServer( ( request, response ) => {
		const pathname = getRequestPathname( request );
		if ( [ '/cache-healthcheck', '/health', '/ready' ].includes( pathname ) ) {
			response.writeHead( 200, { 'Content-Type': 'text/plain' } );
			response.end( 'OK' );
			return;
		}
		response.writeHead( 404, { 'Content-Type': 'text/plain' } );
		response.end( 'Not Found' );
	} );

	setPersistence( new NoopPersistenceProvider() );

	server.on( 'upgrade', ( request: IncomingMessage, socket: Duplex, head: Buffer ): void => {
		const protocols = requestedProtocols( request );
		if ( protocols.length > 0 && ! protocols.includes( MULTIPLEX_SUBPROTOCOL ) ) {
			recordConnectionFailure( 'unsupported_subprotocol' );
			rejectHttpUpgrade( socket, '400 Bad Request' );
			return;
		}
		const isMultiplex = protocols.includes( MULTIPLEX_SUBPROTOCOL );

		const authResult = isRequestAuthenticated( request, options.jwtSecret );
		if ( authResult.authenticated === false ) {
			recordConnectionFailure( authResult.reason );
			rejectHttpUpgrade( socket, '401 Unauthorized' );
			return;
		}

		const initialGrant = authResult.grant;
		const pathname = getRequestPathname( request );
		if ( isMultiplex ) {
			if ( pathname !== '/_ws/vip-rtc' ) {
				recordConnectionFailure( 'invalid_multiplex_path' );
				rejectHttpUpgrade( socket, '400 Bad Request' );
				return;
			}
		} else if ( ! validateLegacyRoomPath( request, initialGrant ) ) {
			recordConnectionFailure( 'invalid_token_payload' );
			rejectHttpUpgrade( socket, '401 Unauthorized' );
			return;
		}

		const wpClientId = initialGrant.wp_client_id ?? initialGrant.connection_id ?? null;
		const userId = initialGrant.user_id;

		wss.handleUpgrade( request, socket, head, ( ws: WebSocket ): void => {
			// `ws` closes invalid connections itself, but its error event must have
			// a listener so one malformed frame cannot become an uncaught process error.
			ws.on( 'error', () => undefined );

			if ( ! shouldAllowCollaborator( wss, userId ) ) {
				recordConnectionFailure( 'collaborator_limit_exceeded' );
				ws.close( 4003, WEBSOCKET_CLOSE_CODES.get( 4003 ) );
				return;
			}
			if ( ! shouldAllowConnection( wss, wpClientId ) ) {
				recordConnectionFailure( 'connection_limit_exceeded' );
				ws.close( 4002, WEBSOCKET_CLOSE_CODES.get( 4002 ) );
				return;
			}

			const connectionStartTime = Date.now();
			ws.wpClientId = wpClientId ?? undefined;
			ws.userId = userId;
			ws.on( 'message', ( data, isBinary ) => {
				recordMessage( data, isBinary );
			} );

			if ( ws.protocol === MULTIPLEX_SUBPROTOCOL ) {
				new MultiplexSession( ws, request, initialGrant, options.jwtSecret ).start();
			} else {
				setupLegacyRoomConnection( ws, request, initialGrant.room_name );
			}

			recordConnectionOpen( wss, { wpClientId } );
			const timeout = setTimeout( () => {
				ws.close( CONNECTION_TIMEOUT_CLOSE.code, CONNECTION_TIMEOUT_CLOSE.reason );
			}, options.connectionTimeout );
			ws.on( 'close', code => {
				clearTimeout( timeout );
				recordConnectionClose( wss, { code, connectionStartTime, wpClientId } );
			} );
		} );
	} );

	return { server, wss };
}
