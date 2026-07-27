import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
	MULTIPLEX_PROTOCOL_FAILURE_CLOSE_CODE,
	getWebSocketClosePolicy,
	getWebSocketCloseScope,
	markAsRoomCloseEvent,
} from '../websocket-close-policy';

function closeEvent( code: number ): CloseEvent {
	return Object.assign( new Event( 'close' ), { code } ) as CloseEvent;
}

describe( 'websocket close policy', () => {
	it( 'owns retry, error, modal, and status metadata for physical closes', () => {
		assert.deepStrictEqual( getWebSocketClosePolicy( 'physical', 4001 ), {
			shouldRetry: true,
			errorCode: 'connection-expired',
			includeRetryMetadata: true,
		} );
		assert.deepStrictEqual( getWebSocketClosePolicy( 'physical', 4002 ), {
			shouldRetry: true,
			errorCode: 'connection-limit-exceeded',
			includeRetryMetadata: false,
		} );
		assert.deepStrictEqual( getWebSocketClosePolicy( 'physical', 4003 ), {
			shouldRetry: true,
			errorCode: 'collaborator-limit-exceeded',
			includeRetryMetadata: false,
		} );
		for ( const code of [ 1011, 4999, undefined ] ) {
			assert.deepStrictEqual( getWebSocketClosePolicy( 'physical', code ), {
				shouldRetry: true,
				errorCode: 'unknown-error',
				includeRetryMetadata: true,
			} );
		}
		for ( const code of [ 1002, 1008, MULTIPLEX_PROTOCOL_FAILURE_CLOSE_CODE ] ) {
			assert.deepStrictEqual( getWebSocketClosePolicy( 'physical', code ), {
				shouldRetry: false,
				errorCode: 'unknown-error',
				includeRetryMetadata: false,
			} );
		}
	} );

	it( 'owns scope-distinct room close behavior and never borrows physical modal mapping', () => {
		assert.deepStrictEqual( getWebSocketClosePolicy( 'room', 4004 ), {
			shouldRetry: false,
			errorCode: 'unknown-error',
			includeRetryMetadata: false,
		} );
		assert.deepStrictEqual( getWebSocketClosePolicy( 'room', 4005 ), {
			shouldRetry: true,
			errorCode: 'unknown-error',
			includeRetryMetadata: true,
		} );
		for ( const code of [ 4002, 4999 ] ) {
			assert.deepStrictEqual( getWebSocketClosePolicy( 'room', code ), {
				shouldRetry: false,
				errorCode: 'unknown-error',
				includeRetryMetadata: false,
			} );
		}
	} );

	it( 'makes voluntary room-limit yield terminal and custom-modal-owned', () => {
		assert.deepStrictEqual( getWebSocketClosePolicy( 'physical', 1000, true ), {
			shouldRetry: false,
			errorCode: 'room-connection-limit-exceeded',
			includeRetryMetadata: false,
		} );
	} );

	it( 'tags only room-scoped close events', () => {
		const physical = closeEvent( 4002 );
		const room = markAsRoomCloseEvent( closeEvent( 4002 ) );

		assert.strictEqual( getWebSocketCloseScope( null ), 'physical' );
		assert.strictEqual( getWebSocketCloseScope( physical ), 'physical' );
		assert.strictEqual( getWebSocketCloseScope( room ), 'room' );
	} );
} );
