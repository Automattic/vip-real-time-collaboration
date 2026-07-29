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
	it( 'maps physical and room close codes to their owned retry policy', () => {
		const cases = [
			[
				'physical',
				[ 4001 ],
				{ shouldRetry: true, errorCode: 'connection-expired', includeRetryMetadata: true },
			],
			[
				'physical',
				[ 4002 ],
				{
					shouldRetry: true,
					errorCode: 'connection-limit-exceeded',
					includeRetryMetadata: false,
				},
			],
			[
				'physical',
				[ 4003 ],
				{
					shouldRetry: true,
					errorCode: 'collaborator-limit-exceeded',
					includeRetryMetadata: false,
				},
			],
			[
				'physical',
				[ 1011, 4999, undefined ],
				{ shouldRetry: true, errorCode: 'unknown-error', includeRetryMetadata: true },
			],
			[
				'physical',
				[ 1002, 1008, MULTIPLEX_PROTOCOL_FAILURE_CLOSE_CODE ],
				{ shouldRetry: false, errorCode: 'unknown-error', includeRetryMetadata: false },
			],
			[
				'room',
				[ 4005 ],
				{ shouldRetry: true, errorCode: 'unknown-error', includeRetryMetadata: true },
			],
			[
				'room',
				[ 4002, 4004, 4999 ],
				{ shouldRetry: false, errorCode: 'unknown-error', includeRetryMetadata: false },
			],
		] as const;

		for ( const [ scope, codes, expected ] of cases ) {
			for ( const code of codes ) {
				assert.deepStrictEqual( getWebSocketClosePolicy( scope, code ), expected );
			}
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
