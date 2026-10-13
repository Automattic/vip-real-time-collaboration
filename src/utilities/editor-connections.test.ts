import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
	addToHeartbeat,
	countConnections,
	EDITOR_CONNECTIONS_HEARTBEAT_KEY,
	recordConnections,
	type EditorConnectionCounts,
} from './editor-connections';
import { COLLABORATOR_INFO_FIELD } from './room-client-limit';

function states( ...clientIds: number[] ): Map< number, Record< string, unknown > > {
	return new Map(
		clientIds.map( clientId => [
			clientId,
			{ [ COLLABORATOR_INFO_FIELD ]: { enteredAt: clientId } },
		] )
	);
}

describe( 'editor-connections', () => {
	describe( 'countConnections', () => {
		it( 'counts each connection, including the local one', () => {
			assert.strictEqual( countConnections( states( 1 ) ), 1 );
			assert.strictEqual( countConnections( states( 1, 2 ) ), 2 );
		} );

		it( 'skips peers that have not published collaborator info yet', () => {
			const withPending = states( 1 );
			withPending.set( 2, {} );
			assert.strictEqual( countConnections( withPending ), 1 );
		} );
	} );

	describe( 'recordConnections', () => {
		it( 'reports a change only when the count changes', () => {
			const counts: EditorConnectionCounts = new Map();
			assert.strictEqual( recordConnections( counts, 46, true, 1 ), true );
			assert.strictEqual( recordConnections( counts, 46, true, 1 ), false );
			assert.strictEqual( recordConnections( counts, 46, true, 2 ), true );
			assert.strictEqual( counts.get( 46 ), 2 );
		} );

		it( 'stops reporting a post while its room is disconnected', () => {
			const counts: EditorConnectionCounts = new Map( [ [ 46, 2 ] ] );
			assert.strictEqual( recordConnections( counts, 46, false, 1 ), true );
			assert.strictEqual( counts.has( 46 ), false );
			assert.strictEqual( recordConnections( counts, 46, false, 1 ), false );
		} );
	} );

	describe( 'addToHeartbeat', () => {
		it( 'sends counts keyed by post ID', () => {
			const data: Record< string, unknown > = {};
			addToHeartbeat(
				new Map( [
					[ 46, 2 ],
					[ 7, 1 ],
				] ),
				data
			);
			assert.deepStrictEqual( data[ EDITOR_CONNECTIONS_HEARTBEAT_KEY ], { 46: 2, 7: 1 } );
		} );

		it( 'leaves the heartbeat alone when there is nothing to report', () => {
			const data: Record< string, unknown > = {};
			addToHeartbeat( new Map(), data );
			assert.strictEqual( EDITOR_CONNECTIONS_HEARTBEAT_KEY in data, false );
		} );
	} );
} );
