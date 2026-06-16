import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
	isLimitEnforced,
	isLocalClientWithinLimit,
	readPresences,
	COLLABORATOR_INFO_FIELD,
	type RoomLimitPresence,
} from './room-client-limit';

function presence( overrides: Partial< RoomLimitPresence > = {} ): RoomLimitPresence {
	return { clientId: 1, joinedAt: 1000, ...overrides };
}

describe( 'room-client-limit', () => {
	describe( 'isLimitEnforced', () => {
		it( 'treats zero, negatives, and non-finite values as unlimited', () => {
			assert.strictEqual( isLimitEnforced( 0 ), false );
			assert.strictEqual( isLimitEnforced( -1 ), false );
			assert.strictEqual( isLimitEnforced( Number.POSITIVE_INFINITY ), false );
			assert.strictEqual( isLimitEnforced( Number.NaN ), false );
		} );

		it( 'enforces positive finite limits', () => {
			assert.strictEqual( isLimitEnforced( 1 ), true );
			assert.strictEqual( isLimitEnforced( 300 ), true );
		} );
	} );

	describe( 'readPresences', () => {
		it( 'parses one record per client and skips peers without collaboratorInfo', () => {
			const states = new Map< number, Record< string, unknown > >( [
				[ 10, { [ COLLABORATOR_INFO_FIELD ]: { id: 5, enteredAt: 1000 } } ],
				[ 11, { editorState: { selection: 'no collaboratorInfo yet' } } ],
				[ 12, { [ COLLABORATOR_INFO_FIELD ]: { enteredAt: 2000 } } ],
			] );

			assert.deepStrictEqual( readPresences( states ), [
				{ clientId: 10, joinedAt: 1000 },
				{ clientId: 12, joinedAt: 2000 },
			] );
		} );

		it( 'defaults a missing enteredAt to Infinity so it sorts last', () => {
			const states = new Map< number, Record< string, unknown > >( [
				[ 10, { [ COLLABORATOR_INFO_FIELD ]: { id: 5 } } ],
			] );

			assert.strictEqual( readPresences( states )[ 0 ]?.joinedAt, Number.POSITIVE_INFINITY );
		} );
	} );

	describe( 'isLocalClientWithinLimit', () => {
		it( 'always allows when the limit is not enforced', () => {
			const presences = [ presence( { clientId: 1, joinedAt: 1 } ) ];
			assert.strictEqual( isLocalClientWithinLimit( presences, 1, 0 ), true );
		} );

		it( 'keeps the earliest connections and yields the latest', () => {
			const presences = [
				presence( { clientId: 1, joinedAt: 1000 } ),
				presence( { clientId: 2, joinedAt: 2000 } ),
				presence( { clientId: 3, joinedAt: 3000 } ),
			];

			assert.strictEqual( isLocalClientWithinLimit( presences, 1, 2 ), true );
			assert.strictEqual( isLocalClientWithinLimit( presences, 2, 2 ), true );
			assert.strictEqual( isLocalClientWithinLimit( presences, 3, 2 ), false );
		} );

		it( 'breaks join-time ties deterministically by clientId', () => {
			const presences = [
				presence( { clientId: 8, joinedAt: 1000 } ),
				presence( { clientId: 3, joinedAt: 1000 } ),
			];

			// clientId 3 sorts ahead of 8 at the same joinedAt.
			assert.strictEqual( isLocalClientWithinLimit( presences, 3, 1 ), true );
			assert.strictEqual( isLocalClientWithinLimit( presences, 8, 1 ), false );
		} );

		it( 'counts each connection separately — multiple tabs of one user do NOT dedupe', () => {
			// All three connections could be the same user in three tabs.
			const presences = [
				presence( { clientId: 1, joinedAt: 1000 } ),
				presence( { clientId: 2, joinedAt: 1500 } ),
				presence( { clientId: 3, joinedAt: 2000 } ),
			];

			// With a connection limit of 2, the third tab yields.
			assert.strictEqual( isLocalClientWithinLimit( presences, 1, 2 ), true );
			assert.strictEqual( isLocalClientWithinLimit( presences, 2, 2 ), true );
			assert.strictEqual( isLocalClientWithinLimit( presences, 3, 2 ), false );
		} );

		it( 'allows the local connection when its presence is not yet visible', () => {
			const presences = [ presence( { clientId: 1, joinedAt: 1000 } ) ];
			// Local clientId 99 is not in the awareness set yet.
			assert.strictEqual( isLocalClientWithinLimit( presences, 99, 1 ), true );
		} );
	} );
} );
