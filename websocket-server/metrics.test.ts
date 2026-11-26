import assert from 'node:assert';
import { it } from 'node:test';
import { register } from 'prom-client';

import { createMetricsServer, getMessageType, getRoomKind } from './metrics';

import type { ProtocolMessage } from './protocol';

it( 'registers default Node.js metrics once', () => {
	createMetricsServer();
	createMetricsServer();

	assert.ok( register.getSingleMetric( 'nodejs_heap_size_used_bytes' ) );
} );

it( 'labels data messages by the y-websocket message type in their payload', () => {
	const cases: Array< [ number[], string ] > = [
		[ [ 0, 0, 5 ], 'sync_step1' ],
		[ [ 0, 1, 5 ], 'sync_step2' ],
		[ [ 0, 2, 5 ], 'update' ],
		[ [ 1, 5 ], 'awareness' ],
		[ [ 0, 9 ], 'other' ],
	];

	for ( const [ bytes, expected ] of cases ) {
		const message: ProtocolMessage = {
			type: 'data',
			room: 'room',
			payload: Uint8Array.from( bytes ),
		};
		assert.strictEqual( getMessageType( message ), expected );
	}
} );

it( 'labels rooms by entity type without the blog or object ID', () => {
	assert.strictEqual(
		getRoomKind( 'site-7/postType/wp_block-collection' ),
		'postType/wp_block:collection'
	);
	assert.strictEqual( getRoomKind( 'site-12/postType/my-type-42' ), 'postType/my-type' );
	assert.strictEqual( getRoomKind( 'site-7/post-1' ), 'other' );
} );
