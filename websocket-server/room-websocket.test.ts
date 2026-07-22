import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';

import { decodeMessage } from './protocol';
import { RoomWebSocket } from './room-websocket';

import type { Data } from 'ws';

class RecordingPhysicalSocket extends EventEmitter {
	public readonly sent: Array< Data | Uint8Array > = [];
	public callbackError: Error | undefined;
	public sendThrow: Error | undefined;
	public sendCalls = 0;

	public send(
		data: Data | Uint8Array,
		_options?: { binary?: boolean },
		callback?: ( error?: Error ) => void
	): void {
		this.sendCalls += 1;
		if ( this.sendThrow ) {
			throw this.sendThrow;
		}
		this.sent.push( data );
		callback?.( this.callbackError );
	}
}

describe( 'RoomWebSocket', () => {
	it( 'envelopes payloads and supports the ws send callback signature', () => {
		const physical = new RecordingPhysicalSocket();
		const roomSocket = new RoomWebSocket( 'site-7/post-1', physical );
		let callbackCalls = 0;

		roomSocket.activate();
		roomSocket.send( Uint8Array.from( [ 0, 1, 2 ] ), { binary: true }, ( error?: Error ) => {
			assert.strictEqual( error, undefined );
			callbackCalls += 1;
		} );

		assert.strictEqual( callbackCalls, 1 );
		assert.strictEqual( physical.sent.length, 1 );
		assert.deepStrictEqual( decodeMessage( physical.sent[ 0 ] as Uint8Array ), {
			type: 'data',
			room: 'site-7/post-1',
			payload: Uint8Array.from( [ 0, 1, 2 ] ),
		} );
	} );

	it( 'queues y-websocket data until the room is activated', () => {
		const physical = new RecordingPhysicalSocket();
		const roomSocket = new RoomWebSocket( 'site-7/post-1', physical );

		roomSocket.send( Uint8Array.from( [ 0 ] ) );
		assert.strictEqual( physical.sent.length, 0 );

		roomSocket.activate();
		assert.strictEqual( physical.sent.length, 1 );
	} );

	it( 'stops queued sends after a synchronous failure closes the room adapter', () => {
		const physical = new RecordingPhysicalSocket();
		const roomSocket = new RoomWebSocket( 'site-7/post-1', physical );
		physical.sendThrow = new Error( 'synchronous failure' );
		roomSocket.on( 'physical-send-error', () => {
			roomSocket.close();
		} );

		roomSocket.send( Uint8Array.from( [ 0 ] ) );
		roomSocket.send( Uint8Array.from( [ 1 ] ) );
		roomSocket.activate();

		assert.strictEqual( roomSocket.readyState, roomSocket.CLOSED );
		assert.strictEqual( physical.sendCalls, 1 );
	} );

	it( 'answers ping with a local pong without using the physical socket', () => {
		const physical = new RecordingPhysicalSocket();
		const roomSocket = new RoomWebSocket( 'site-7/post-1', physical );
		let pongCalls = 0;
		roomSocket.on( 'pong', () => {
			pongCalls += 1;
		} );

		roomSocket.ping();

		assert.strictEqual( pongCalls, 1 );
		assert.strictEqual( physical.sent.length, 0 );
	} );

	it( 'closes idempotently and emits close once', () => {
		const physical = new RecordingPhysicalSocket();
		const roomSocket = new RoomWebSocket( 'site-7/post-1', physical );
		let closeCalls = 0;
		roomSocket.on( 'close', () => {
			closeCalls += 1;
		} );

		roomSocket.close();
		roomSocket.close();

		assert.strictEqual( closeCalls, 1 );
		assert.strictEqual( roomSocket.readyState, roomSocket.CLOSED );
	} );

	it( 'surfaces a physical send callback error and preserves callback compatibility', () => {
		const physical = new RecordingPhysicalSocket();
		const sendError = new Error( 'callback failure' );
		physical.callbackError = sendError;
		const roomSocket = new RoomWebSocket( 'site-7/post-1', physical );
		const surfacedErrors: Error[] = [];
		const callbackErrors: Array< Error | undefined > = [];
		roomSocket.on( 'physical-send-error', error => {
			surfacedErrors.push( error as Error );
		} );
		roomSocket.activate();

		roomSocket.send( Uint8Array.from( [ 0 ] ), error => {
			callbackErrors.push( error );
		} );

		assert.deepStrictEqual( surfacedErrors, [ sendError ] );
		assert.deepStrictEqual( callbackErrors, [ sendError ] );
	} );

	it( 'surfaces a synchronous physical send throw and passes it to the callback once', () => {
		const physical = new RecordingPhysicalSocket();
		const sendError = new Error( 'synchronous failure' );
		physical.sendThrow = sendError;
		const roomSocket = new RoomWebSocket( 'site-7/post-1', physical );
		const surfacedErrors: Error[] = [];
		const callbackErrors: Array< Error | undefined > = [];
		roomSocket.on( 'physical-send-error', error => {
			surfacedErrors.push( error as Error );
		} );
		roomSocket.activate();

		assert.doesNotThrow( () =>
			roomSocket.send( Uint8Array.from( [ 0 ] ), error => {
				callbackErrors.push( error );
			} )
		);
		assert.strictEqual( surfacedErrors.length, 1 );
		assert.strictEqual( surfacedErrors[ 0 ], sendError );
		assert.strictEqual( callbackErrors.length, 1 );
		assert.strictEqual( callbackErrors[ 0 ], sendError );
	} );
} );
