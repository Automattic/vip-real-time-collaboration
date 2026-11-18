import { docs } from '@y/websocket-server/utils';
import jwt from 'jsonwebtoken';
import * as encoding from 'lib0/encoding';
import assert from 'node:assert';
import { once } from 'node:events';
import { afterEach, describe, it } from 'node:test';
import { register } from 'prom-client';
import { WebSocket, type RawData } from 'ws';

import { isCollectionRoom, isEmptyAwarenessMessage } from './collection-awareness';
import { decodeMessage, encodeMessage, MULTIPLEX_SUBPROTOCOL } from './protocol';
import { createRtcServer, type RtcServer } from './server';

import type { AddressInfo } from 'node:net';

const JWT_SECRET = 'collection-awareness-test-secret';
const COLLECTION_ROOM = 'site-7/root/comment-collection';
const POST_ROOM = 'site-7/postType/post-1';
const SILENCE_MS = 50;

type ClientState = [ clientId: number, clock: number, state: string ];

function awarenessMessage( states: ClientState[] ): Uint8Array {
	const update = encoding.createEncoder();
	encoding.writeVarUint( update, states.length );
	for ( const [ clientId, clock, state ] of states ) {
		encoding.writeVarUint( update, clientId );
		encoding.writeVarUint( update, clock );
		encoding.writeVarString( update, state );
	}
	const message = encoding.createEncoder();
	encoding.writeVarUint( message, 1 );
	encoding.writeVarUint8Array( message, encoding.toUint8Array( update ) );
	return encoding.toUint8Array( message );
}

function grant( room: string, wpClientId: string, userId: number ): string {
	return jwt.sign(
		{ blog_id: 7, room_name: room, user_id: userId, username: 'u', wp_client_id: wpClientId },
		JWT_SECRET
	);
}

/** One peer in a room, over either transport, exposing its inbound y-websocket messages. */
interface Peer {
	received: Uint8Array[];
	send: ( message: Uint8Array ) => void;
}

let runningServer: RtcServer | undefined;
const sockets = new Set< WebSocket >();

async function startServer(): Promise< string > {
	runningServer = createRtcServer( { jwtSecret: JWT_SECRET, connectionTimeout: 60_000 } );
	runningServer.server.listen( 0, '127.0.0.1' );
	await once( runningServer.server, 'listening' );
	return `ws://127.0.0.1:${ ( runningServer.server.address() as AddressInfo ).port }`;
}

async function openSocket( url: string, protocol?: string ): Promise< WebSocket > {
	const socket = protocol ? new WebSocket( url, protocol ) : new WebSocket( url );
	sockets.add( socket );
	await once( socket, 'open' );
	return socket;
}

async function legacyPeer( baseUrl: string, room: string, index: number ): Promise< Peer > {
	const socket = await openSocket(
		`${ baseUrl }/_ws/${ room }?auth=${ grant( room, `client-${ index }`, index ) }`
	);
	const received: Uint8Array[] = [];
	socket.on( 'message', ( data: RawData ) => received.push( new Uint8Array( data as Buffer ) ) );
	return { received, send: message => socket.send( message ) };
}

async function multiplexPeer( baseUrl: string, room: string, index: number ): Promise< Peer > {
	const token = grant( room, `client-${ index }`, index );
	const socket = await openSocket(
		`${ baseUrl }/_ws/vip-rtc?auth=${ token }`,
		MULTIPLEX_SUBPROTOCOL
	);
	const received: Uint8Array[] = [];
	let resolveSubscribed: () => void = () => undefined;
	const subscribed = new Promise< void >( resolve => {
		resolveSubscribed = resolve;
	} );
	socket.on( 'message', ( data: RawData ) => {
		const message = decodeMessage( data as Uint8Array );
		if ( message.type === 'subscribed' ) {
			resolveSubscribed();
		} else if ( message.type === 'data' ) {
			received.push( Uint8Array.from( message.payload ) );
		}
	} );
	socket.send( encodeMessage( { type: 'subscribe', room, grant: token } ) );
	await subscribed;
	return {
		received,
		send: payload => socket.send( encodeMessage( { type: 'data', room, payload } ) ),
	};
}

const delay = ( ms: number ): Promise< void > =>
	new Promise( resolve => setTimeout( resolve, ms ) );

function awarenessReceived( peer: Peer ): Uint8Array[] {
	return peer.received.filter( message => message[ 0 ] === 1 );
}

async function suppressedMetric(): Promise< number > {
	const metric = register.getSingleMetric( 'wpvip_rtc_collection_awareness_suppressed_total' );
	assert.ok( metric );
	return ( await metric.get() ).values[ 0 ]?.value ?? 0;
}

afterEach( async () => {
	for ( const socket of sockets ) {
		socket.close();
	}
	await Promise.all(
		Array.from( sockets, socket =>
			socket.readyState === WebSocket.CLOSED ? Promise.resolve() : once( socket, 'close' )
		)
	);
	sockets.clear();
	await delay( 20 );
	if ( runningServer ) {
		runningServer.wss.close();
		await new Promise< void >( resolve => runningServer?.server.close( () => resolve() ) );
		runningServer = undefined;
	}
} );

describe( 'isCollectionRoom', () => {
	it( 'matches collection rooms only', () => {
		assert.strictEqual( isCollectionRoom( COLLECTION_ROOM ), true );
		assert.strictEqual( isCollectionRoom( 'site-7/postType/wp_template-collection' ), true );
		assert.strictEqual( isCollectionRoom( POST_ROOM ), false );
	} );
} );

describe( 'isEmptyAwarenessMessage', () => {
	it( 'accepts updates whose states are all empty or removed', () => {
		assert.strictEqual( isEmptyAwarenessMessage( awarenessMessage( [ [ 1, 3, '{}' ] ] ) ), true );
		assert.strictEqual(
			isEmptyAwarenessMessage(
				awarenessMessage( [
					[ 1, 3, '{}' ],
					[ 2, 9, 'null' ],
				] )
			),
			true
		);
	} );

	it( 'rejects updates that carry presence state', () => {
		assert.strictEqual(
			isEmptyAwarenessMessage(
				awarenessMessage( [
					[ 1, 3, '{}' ],
					[ 2, 1, '{"collaboratorInfo":{"id":2}}' ],
				] )
			),
			false
		);
	} );

	it( 'rejects sync messages, empty updates, and malformed input', () => {
		assert.strictEqual( isEmptyAwarenessMessage( new Uint8Array( [ 0, 0, 1, 0 ] ) ), false );
		assert.strictEqual( isEmptyAwarenessMessage( awarenessMessage( [] ) ), false );
		assert.strictEqual( isEmptyAwarenessMessage( new Uint8Array( [ 1, 9, 1 ] ) ), false );
		const trailing = new Uint8Array( [ ...awarenessMessage( [ [ 1, 3, '{}' ] ] ), 0 ] );
		assert.strictEqual( isEmptyAwarenessMessage( trailing ), false );
	} );
} );

for ( const [ transport, createPeer ] of [
	[ 'legacy', legacyPeer ],
	[ 'multiplex', multiplexPeer ],
] as const ) {
	describe( `collection room awareness over the ${ transport } transport`, () => {
		it( 'echoes empty awareness to the sender without broadcasting or storing it', async () => {
			const baseUrl = await startServer();
			const sender = await createPeer( baseUrl, COLLECTION_ROOM, 1 );
			const peer = await createPeer( baseUrl, COLLECTION_ROOM, 2 );
			const before = await suppressedMetric();
			const message = awarenessMessage( [ [ 101, 4, '{}' ] ] );

			sender.send( message );
			await delay( SILENCE_MS );

			assert.deepStrictEqual( awarenessReceived( sender ), [ message ] );
			assert.deepStrictEqual( awarenessReceived( peer ), [] );
			assert.strictEqual( docs.get( COLLECTION_ROOM )?.awareness.getStates().size, 0 );
			assert.strictEqual( await suppressedMetric(), before + 1 );
		} );

		it( 'still broadcasts collection awareness that carries state', async () => {
			const baseUrl = await startServer();
			const sender = await createPeer( baseUrl, COLLECTION_ROOM, 1 );
			const peer = await createPeer( baseUrl, COLLECTION_ROOM, 2 );

			sender.send( awarenessMessage( [ [ 101, 1, '{"collaboratorInfo":{"id":1}}' ] ] ) );
			await delay( SILENCE_MS );

			assert.strictEqual( awarenessReceived( peer ).length, 1 );
			assert.strictEqual( docs.get( COLLECTION_ROOM )?.awareness.getStates().size, 1 );
		} );

		it( 'still broadcasts empty awareness in entity rooms', async () => {
			const baseUrl = await startServer();
			const sender = await createPeer( baseUrl, POST_ROOM, 1 );
			const peer = await createPeer( baseUrl, POST_ROOM, 2 );

			sender.send( awarenessMessage( [ [ 101, 1, '{}' ] ] ) );
			await delay( SILENCE_MS );

			assert.strictEqual( awarenessReceived( peer ).length, 1 );
		} );
	} );
}
