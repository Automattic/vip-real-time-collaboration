import { docs } from '@y/websocket-server/utils';
import jwt from 'jsonwebtoken';
import assert from 'node:assert';
import { EventEmitter, once } from 'node:events';
import net from 'node:net';
import { afterEach, describe, it, mock } from 'node:test';
import { register } from 'prom-client';
import { WebSocket, type RawData } from 'ws';

import {
	decodeMessage,
	encodeMessage,
	MULTIPLEX_SUBPROTOCOL,
	type ProtocolMessage,
} from './protocol';
import { createRtcServer, type RtcServer } from './server';

import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const JWT_SECRET = 'server-test-secret';

function grant(
	roomName: string,
	overrides: Partial< {
		blog_id: number;
		connection_id: string;
		exp: number;
		user_id: number;
		username: string;
		wp_client_id: string | undefined;
	} > = {}
): string {
	return jwt.sign(
		{
			blog_id: 7,
			room_name: roomName,
			user_id: 42,
			username: 'test-user',
			wp_client_id: 'client-1',
			...overrides,
		},
		JWT_SECRET
	);
}

function invalidGrant( roomName: unknown ): string {
	return jwt.sign(
		{
			blog_id: 7,
			room_name: roomName,
			user_id: 42,
			username: 'test-user',
			wp_client_id: 'client-1',
		},
		JWT_SECRET
	);
}

let runningServer: RtcServer | undefined;
const clients = new Set< WebSocket >();

async function startServer( connectionTimeout = 60_000 ): Promise< string > {
	runningServer = createRtcServer( { jwtSecret: JWT_SECRET, connectionTimeout } );
	runningServer.server.listen( 0, '127.0.0.1' );
	await once( runningServer.server, 'listening' );
	const address = runningServer.server.address() as AddressInfo;
	return `ws://127.0.0.1:${ address.port }`;
}

async function metricValue( name: string ): Promise< number > {
	const metric = register.getSingleMetric( name );
	assert.ok( metric );
	const { values } = await metric.get();
	assert.strictEqual( values.length, 1 );
	const value = values[ 0 ];
	assert.ok( value );
	return value.value;
}

async function waitForMetric( name: string, expected: number ): Promise< void > {
	for ( let attempt = 0; attempt < 20; attempt += 1 ) {
		// eslint-disable-next-line no-await-in-loop -- poll server-side metric delivery with a bound.
		if ( ( await metricValue( name ) ) === expected ) {
			return;
		}
		// eslint-disable-next-line no-await-in-loop -- each delay precedes the next bounded poll.
		await new Promise< void >( resolve => setTimeout( resolve, 5 ) );
	}
	assert.strictEqual( await metricValue( name ), expected );
}

async function connect(
	baseUrl: string,
	path: string,
	protocols?: string | string[]
): Promise< WebSocket > {
	const client = protocols
		? new WebSocket( `${ baseUrl }${ path }`, protocols )
		: new WebSocket( `${ baseUrl }${ path }` );
	clients.add( client );
	await once( client, 'open' );
	return client;
}

function waitForMultiplexMessage(
	client: WebSocket,
	predicate: ( message: ProtocolMessage ) => boolean
): Promise< ProtocolMessage > {
	return new Promise( ( resolve, reject ) => {
		const cleanup = (): void => {
			client.off( 'message', handleMessage );
			client.off( 'close', handleClose );
			client.off( 'error', handleError );
		};
		const handleMessage = ( data: RawData ): void => {
			const message = decodeMessage( data as Uint8Array );
			if ( ! predicate( message ) ) {
				return;
			}
			cleanup();
			resolve( message );
		};
		const handleClose = (): void => {
			cleanup();
			reject( new Error( 'WebSocket closed before the expected multiplex message arrived' ) );
		};
		const handleError = ( error: Error ): void => {
			cleanup();
			reject( error );
		};
		client.on( 'message', handleMessage );
		client.once( 'close', handleClose );
		client.once( 'error', handleError );
	} );
}

async function upgradeResult(
	client: WebSocket
): Promise< { type: 'open' } | { type: 'error'; error: Error } > {
	return new Promise( resolve => {
		const handleOpen = (): void => {
			client.off( 'error', handleError );
			resolve( { type: 'open' } );
		};
		const handleError = ( error: Error ): void => {
			client.off( 'open', handleOpen );
			resolve( { type: 'error', error } );
		};
		client.once( 'open', handleOpen );
		client.once( 'error', handleError );
	} );
}

afterEach( async () => {
	mock.restoreAll();
	for ( const client of clients ) {
		if ( client.readyState === WebSocket.OPEN ) {
			client.close();
		}
	}
	await Promise.all(
		Array.from( clients, client =>
			client.readyState === WebSocket.CLOSED ? Promise.resolve() : once( client, 'close' )
		)
	);
	await new Promise< void >( resolve => setTimeout( resolve, 20 ) );
	clients.clear();
	if ( runningServer ) {
		runningServer.wss.close();
		await new Promise< void >( resolve => runningServer?.server.close( () => resolve() ) );
		runningServer = undefined;
	}
} );

describe( 'WebSocket transport routing', () => {
	it(
		'rejects multiplex message waits and removes listeners when the client closes or errors',
		{ timeout: 1_000 },
		async () => {
			await Promise.all(
				[ 'close', 'error' ].map( async event => {
					const client = new EventEmitter() as unknown as WebSocket;
					if ( event === 'error' ) {
						client.once( 'error', () => undefined );
					}
					const pending = waitForMultiplexMessage( client, () => false );
					client.emit( event, event === 'error' ? new Error( 'socket error' ) : 1006 );

					await assert.rejects( pending );
					assert.strictEqual( client.listenerCount( 'message' ), 0 );
					assert.strictEqual( client.listenerCount( 'close' ), 0 );
					assert.strictEqual( client.listenerCount( 'error' ), 0 );
				} )
			);
		}
	);

	it( 'routes an upgrade with no subprotocol through the legacy one-room path', async () => {
		const baseUrl = await startServer();
		const room = 'site-7/post-legacy';
		const client = await connect( baseUrl, `/_ws/${ room }?auth=${ grant( room ) }` );

		assert.strictEqual( client.protocol, '' );
		assert.strictEqual( docs.get( room )?.conns.size, 1 );
	} );

	it( 'routes /_ws/vip-rtc through multiplex and selects V1', async () => {
		const activeRoomsBefore = await metricValue( 'wpvip_rtc_active_room_connections' );
		const baseUrl = await startServer();
		const room = 'site-7/post-multiplex';
		const bootstrapGrant = grant( room );
		let selectedHeader: string | undefined;
		const client = new WebSocket( `${ baseUrl }/_ws/vip-rtc?auth=${ bootstrapGrant }`, [
			'vip-rtc-multiplex-v2',
			MULTIPLEX_SUBPROTOCOL,
		] );
		clients.add( client );
		client.on( 'upgrade', response => {
			selectedHeader = response.headers[ 'sec-websocket-protocol' ];
		} );
		await once( client, 'open' );

		assert.strictEqual( client.protocol, MULTIPLEX_SUBPROTOCOL );
		assert.strictEqual( selectedHeader, MULTIPLEX_SUBPROTOCOL );
		assert.strictEqual( docs.has( room ), false );
		assert.strictEqual( runningServer?.wss.clients.size, 1 );
		assert.strictEqual(
			await metricValue( 'wpvip_rtc_active_room_connections' ),
			activeRoomsBefore
		);

		const messages: ProtocolMessage[] = [];
		const roomReady = new Promise< void >( resolve => {
			client.on( 'message', data => {
				messages.push( decodeMessage( data as Uint8Array ) );
				if ( messages.length === 2 ) {
					resolve();
				}
			} );
		} );
		client.send( encodeMessage( { type: 'subscribe', room, grant: bootstrapGrant } ) );
		await roomReady;
		assert.deepStrictEqual( messages[ 0 ], { type: 'subscribed', room } );
		assert.strictEqual( messages[ 1 ]?.type, 'data' );
		assert.strictEqual( messages[ 1 ]?.room, room );
	} );

	for ( const path of [ '/', '/_ws', '/vip-rtc', '/site-7/post-room-path' ] ) {
		it( `rejects ${ path } selected for multiplex transport`, async () => {
			const baseUrl = await startServer();
			const room = 'site-7/post-room-path';
			const client = new WebSocket( `${ baseUrl }${ path }?auth=${ grant( room ) }`, [
				MULTIPLEX_SUBPROTOCOL,
			] );
			clients.add( client );

			const result = await upgradeResult( client );

			assert.strictEqual( result.type, 'error' );
			assert.match(
				result.type === 'error' ? result.error.message : '',
				/Unexpected server response: 400/
			);
			assert.strictEqual( docs.has( room ), false );
		} );
	}

	it( 'rejects unsupported-only subprotocols without falling back to legacy', async () => {
		const baseUrl = await startServer();
		const room = 'site-7/post-unsupported';
		const client = new WebSocket( `${ baseUrl }/${ room }?auth=${ grant( room ) }`, [
			'vip-rtc-multiplex-v2',
		] );
		clients.add( client );

		const result = await upgradeResult( client );

		assert.strictEqual( result.type, 'error' );
		assert.match(
			result.type === 'error' ? result.error.message : '',
			/Unexpected server response: 400/
		);
		assert.strictEqual( docs.has( room ), false );
	} );

	it(
		'destroys a rejected raw upgrade socket after flushing its response',
		{ timeout: 1_000 },
		async () => {
			const baseUrl = await startServer();
			const address = new URL( baseUrl );
			const serverSocketPromise = once( runningServer?.server as HttpServer, 'connection' );
			const client = net.createConnection( {
				allowHalfOpen: true,
				host: address.hostname,
				port: Number( address.port ),
			} );
			try {
				await once( client, 'connect' );
				const [ serverSocket ] = ( await serverSocketPromise ) as [ net.Socket ];
				const finishPromise = once( serverSocket, 'finish' );
				client.write(
					[
						'GET / HTTP/1.1',
						`Host: ${ address.host }`,
						'Connection: Upgrade',
						'Upgrade: websocket',
						'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
						'Sec-WebSocket-Version: 13',
						'Sec-WebSocket-Protocol: vip-rtc-multiplex-v2',
						'',
						'',
					].join( '\r\n' )
				);

				const [ response ] = ( await once( client, 'data' ) ) as [ Buffer ];
				assert.match( response.toString(), /^HTTP\/1\.1 400 Bad Request\r\n/ );
				await finishPromise;
				assert.strictEqual( serverSocket.destroyed, true );
			} finally {
				client.destroy();
			}
		}
	);

	it(
		'isolates an invalid WebSocket frame to the affected connection',
		{ timeout: 1_000 },
		async () => {
			const baseUrl = await startServer();
			const path = `/_ws/vip-rtc?auth=${ grant( 'site-7/post-invalid-frame' ) }`;
			const client = await connect( baseUrl, path, MULTIPLEX_SUBPROTOCOL );
			const closed = once( client, 'close' );

			client.send( 'invalid', { mask: false } );
			await closed;

			await connect( baseUrl, path, MULTIPLEX_SUBPROTOCOL );
		}
	);

	it( 'retains exact legacy URL-to-room matching', async () => {
		const baseUrl = await startServer();
		const client = new WebSocket(
			`${ baseUrl }/site-7/post-requested?auth=${ grant( 'site-7/post-granted' ) }`
		);
		clients.add( client );

		const result = await upgradeResult( client );

		assert.strictEqual( result.type, 'error' );
		assert.match(
			result.type === 'error' ? result.error.message : '',
			/Unexpected server response: 401/
		);
		assert.strictEqual( docs.has( 'site-7/post-requested' ), false );
		assert.strictEqual( docs.has( 'site-7/post-granted' ), false );
	} );

	for ( const path of [ '/', '/_ws' ] ) {
		it( `rejects bare legacy path ${ path } because a room is required`, async () => {
			const baseUrl = await startServer();
			const room = 'site-7/post-missing-path';
			const client = new WebSocket( `${ baseUrl }${ path }?auth=${ grant( room ) }` );
			clients.add( client );

			const result = await upgradeResult( client );

			assert.strictEqual( result.type, 'error' );
			assert.match(
				result.type === 'error' ? result.error.message : '',
				/Unexpected server response: 401/
			);
			assert.strictEqual( docs.has( room ), false );
		} );
	}

	it( 'rejects an empty initial multiplex room before creating a Y.Doc', async () => {
		const baseUrl = await startServer();
		const client = new WebSocket( `${ baseUrl }/?auth=${ invalidGrant( '' ) }`, [
			MULTIPLEX_SUBPROTOCOL,
		] );
		clients.add( client );

		const result = await upgradeResult( client );

		assert.strictEqual( result.type, 'error' );
		assert.match(
			result.type === 'error' ? result.error.message : '',
			/Unexpected server response: 401/
		);
		assert.strictEqual( docs.has( '' ), false );
	} );

	it( 'uses the identical verified room_name Y.Doc key for legacy and multiplex', async () => {
		const baseUrl = await startServer();
		const room = 'site-7/post-shared';
		await connect( baseUrl, `/_ws/${ room }?auth=${ grant( room ) }` );
		const multiplex = await connect(
			baseUrl,
			`/_ws/vip-rtc?auth=${ grant( room ) }`,
			MULTIPLEX_SUBPROTOCOL
		);
		const subscribed = waitForMultiplexMessage(
			multiplex,
			message => message.type === 'subscribed' && message.room === room
		);
		multiplex.send( encodeMessage( { type: 'subscribe', room, grant: grant( room ) } ) );
		await subscribed;

		assert.deepStrictEqual( Array.from( docs.keys() ), [ room ] );
		assert.strictEqual( docs.get( room )?.conns.size, 2 );
	} );

	it(
		'routes and cleans up a later multiplex room through a real WebSocket',
		{ timeout: 1_000 },
		async () => {
			const baseUrl = await startServer();
			const initialRoom = 'site-7/post-initial';
			const laterRoom = 'site-7/post-later';
			const client = await connect(
				baseUrl,
				`/_ws/vip-rtc?auth=${ grant( initialRoom ) }`,
				MULTIPLEX_SUBPROTOCOL
			);
			const subscribed = waitForMultiplexMessage(
				client,
				message => message.type === 'subscribed' && message.room === laterRoom
			);
			const initialData = waitForMultiplexMessage(
				client,
				message => message.type === 'data' && message.room === laterRoom
			);
			const roomReady = Promise.all( [ subscribed, initialData ] );

			client.send(
				encodeMessage( {
					type: 'subscribe',
					room: laterRoom,
					grant: grant( laterRoom ),
				} )
			);

			const [ , data ] = await roomReady;
			assert.strictEqual( data.type, 'data' );
			const document = docs.get( laterRoom );
			assert.ok( document );
			const roomSocket = Array.from( document.conns.keys() )[ 0 ] as WebSocket | undefined;
			assert.ok( roomSocket );
			const routed = once( roomSocket, 'message' );
			const roomClosed = once( roomSocket, 'close' );

			client.send( encodeMessage( { type: 'data', room: laterRoom, payload: data.payload } ) );
			await routed;
			client.send( encodeMessage( { type: 'unsubscribe', room: laterRoom } ) );
			await roomClosed;

			assert.strictEqual( docs.has( laterRoom ), false );
		}
	);

	it( 'returns a retryable room close when the bootstrap grant expires before subscribe', async t => {
		t.mock.timers.enable( { apis: [ 'Date' ], now: 1_700_000_000_000 } );
		const activeRoomsBefore = await metricValue( 'wpvip_rtc_active_room_connections' );
		const baseUrl = await startServer();
		const room = 'site-7/post-expired-bootstrap';
		const bootstrapGrant = grant( room, { exp: 1_700_000_001 } );
		const client = await connect(
			baseUrl,
			`/_ws/vip-rtc?auth=${ bootstrapGrant }`,
			MULTIPLEX_SUBPROTOCOL
		);

		t.mock.timers.setTime( 1_700_000_002_000 );
		const roomClosed = waitForMultiplexMessage(
			client,
			message => message.type === 'room_closed' && message.room === room && message.code === 4005
		);
		client.send( encodeMessage( { type: 'subscribe', room, grant: bootstrapGrant } ) );
		await roomClosed;

		assert.strictEqual( docs.has( room ), false );
		assert.strictEqual(
			await metricValue( 'wpvip_rtc_active_room_connections' ),
			activeRoomsBefore
		);
		assert.strictEqual( client.readyState, WebSocket.OPEN );
	} );

	for ( const protocol of [ undefined, MULTIPLEX_SUBPROTOCOL ] ) {
		it( `keeps physical timeout and metrics common to the ${
			protocol ? 'multiplex' : 'legacy'
		} transport`, async () => {
			const activeConnectionsBefore = await metricValue( 'wpvip_rtc_active_connections' );
			const activeRoomsBefore = await metricValue( 'wpvip_rtc_active_room_connections' );
			const messagesBefore = await metricValue( 'wpvip_rtc_messages_total' );
			const baseUrl = await startServer( 100 );
			const room = `site-7/post-common-${ protocol ? 'multiplex' : 'legacy' }`;
			const path = protocol ? '/_ws/vip-rtc' : `/${ room }`;
			const client = await connect( baseUrl, `${ path }?auth=${ grant( room ) }`, protocol );
			const closePromise = once( client, 'close' );

			assert.strictEqual(
				await metricValue( 'wpvip_rtc_active_connections' ),
				activeConnectionsBefore + 1
			);
			if ( protocol ) {
				assert.strictEqual( runningServer?.wss.clients.size, 1 );
				assert.strictEqual( docs.has( room ), false );
				assert.strictEqual(
					await metricValue( 'wpvip_rtc_active_room_connections' ),
					activeRoomsBefore
				);
			}
			client.send(
				protocol ? encodeMessage( { type: 'unsubscribe', room } ) : Buffer.from( [ 99 ] )
			);
			await waitForMetric( 'wpvip_rtc_messages_total', messagesBefore + 1 );

			const [ closeCode ] = ( await closePromise ) as [ number, Buffer ];
			assert.strictEqual( closeCode, 4001 );
			await waitForMetric( 'wpvip_rtc_active_connections', activeConnectionsBefore );
		} );
	}
} );
