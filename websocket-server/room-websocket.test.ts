import assert from 'node:assert';
import { describe, it } from 'node:test';

import { RoomWebSocket } from './room-websocket';

describe( 'RoomWebSocket', () => {
	it( 'delegates Uint8Array payloads and supports the ws options/callback signature', () => {
		const sent: Uint8Array[] = [];
		const roomSocket = new RoomWebSocket( ( payload, callback ) => {
			sent.push( payload );
			callback?.();
		} );
		const payload = Uint8Array.from( [ 0, 1, 2 ] );
		let callbackCalls = 0;

		roomSocket.send( payload, { binary: true }, error => {
			assert.strictEqual( error, undefined );
			callbackCalls += 1;
		} );

		assert.strictEqual( callbackCalls, 1 );
		assert.deepStrictEqual( sent, [ payload ] );
	} );

	it( 'passes sender callback errors to y-websocket', () => {
		const sendError = new Error( 'physical send failed' );
		const roomSocket = new RoomWebSocket( ( _payload, callback ) => callback?.( sendError ) );
		let callbackError: Error | undefined;

		roomSocket.send( Uint8Array.from( [ 0 ] ), error => {
			callbackError = error;
		} );

		assert.strictEqual( callbackError, sendError );
	} );

	it( 'answers ping with a local pong', () => {
		const roomSocket = new RoomWebSocket( () => {} );
		let pongCalls = 0;
		roomSocket.on( 'pong', () => {
			pongCalls += 1;
		} );

		roomSocket.ping();

		assert.strictEqual( pongCalls, 1 );
	} );

	it( 'closes idempotently and rejects later sends', () => {
		const roomSocket = new RoomWebSocket( () => {} );
		let closeCalls = 0;
		let sendError: Error | undefined;
		roomSocket.on( 'close', () => {
			closeCalls += 1;
		} );

		roomSocket.close();
		roomSocket.close();
		roomSocket.send( Uint8Array.from( [ 0 ] ), error => {
			sendError = error;
		} );

		assert.strictEqual( closeCalls, 1 );
		assert.strictEqual( roomSocket.readyState, roomSocket.CLOSED );
		assert.match( sendError?.message ?? '', /closed/ );
	} );
} );
