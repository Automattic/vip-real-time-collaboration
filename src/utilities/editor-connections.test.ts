import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import {
	addToHeartbeat,
	AwarenessGate,
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

	describe( 'AwarenessGate', () => {
		it( 'does not report a reconnect before the room awareness arrives', () => {
			mock.timers.enable( { apis: [ 'setTimeout' ] } );
			try {
				// Shared post: the server holds 2. This client reconnects, and its
				// awareness holds only itself until the server resends the room.
				const counts: EditorConnectionCounts = new Map();
				let roomStates = states( 1 );
				const report = (): boolean =>
					recordConnections( counts, 46, gate.isOpen(), countConnections( roomStates ) );
				const gate: AwarenessGate = new AwarenessGate( () => report() );

				gate.connected();
				assert.strictEqual( report(), false );
				assert.strictEqual( counts.has( 46 ), false );

				roomStates = states( 1, 2 );
				gate.receivedAwareness();
				assert.strictEqual( counts.get( 46 ), 2 );
			} finally {
				mock.timers.reset();
			}
		} );

		it( 'opens after the wait when no awareness arrives', () => {
			mock.timers.enable( { apis: [ 'setTimeout' ] } );
			try {
				const onOpen = mock.fn();
				const gate = new AwarenessGate( onOpen, 3000 );

				gate.connected();
				mock.timers.tick( 2999 );
				assert.strictEqual( gate.isOpen(), false );

				mock.timers.tick( 1 );
				assert.strictEqual( gate.isOpen(), true );
				assert.strictEqual( onOpen.mock.callCount(), 1 );
			} finally {
				mock.timers.reset();
			}
		} );

		it( 'closes on disconnect and ignores awareness until the next connect', () => {
			mock.timers.enable( { apis: [ 'setTimeout' ] } );
			try {
				const onOpen = mock.fn();
				const gate = new AwarenessGate( onOpen );

				gate.connected();
				gate.receivedAwareness();
				gate.disconnected();
				assert.strictEqual( gate.isOpen(), false );

				gate.receivedAwareness();
				mock.timers.tick( 10000 );
				assert.strictEqual( gate.isOpen(), false );
				assert.strictEqual( onOpen.mock.callCount(), 1 );
			} finally {
				mock.timers.reset();
			}
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
