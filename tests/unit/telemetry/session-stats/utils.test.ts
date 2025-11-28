import assert from 'node:assert';
import { afterEach, before, describe, it, mock } from 'node:test';

describe( 'telemetry/session-stats/utils', () => {
	let isPositiveInteger: typeof import('@/telemetry/session-stats/utils').isPositiveInteger;
	let isUserConnected: typeof import('@/telemetry/session-stats/utils').isUserConnected;
	let areUserSetsEqual: typeof import('@/telemetry/session-stats/utils').areUserSetsEqual;
	let getConnectedUserIds: typeof import('@/telemetry/session-stats/utils').getConnectedUserIds;
	let getConnectedUserCount: typeof import('@/telemetry/session-stats/utils').getConnectedUserCount;

	let selectMock: ReturnType< typeof mock.fn >;

	before( async () => {
		selectMock = mock.fn();

		mock.module( '@wordpress/data', {
			namedExports: { select: selectMock },
		} );
		mock.module( '@/store/awareness-store', {
			namedExports: { store: 'mock-awareness-store' },
		} );

		const utils = await import( '@/telemetry/session-stats/utils' );
		isPositiveInteger = utils.isPositiveInteger;
		isUserConnected = utils.isUserConnected;
		areUserSetsEqual = utils.areUserSetsEqual;
		getConnectedUserIds = utils.getConnectedUserIds;
		getConnectedUserCount = utils.getConnectedUserCount;
	} );

	afterEach( () => {
		selectMock.mock.resetCalls();
	} );

	describe( 'isPositiveInteger', () => {
		it( 'returns true for positive integers', () => {
			assert.strictEqual( isPositiveInteger( 1 ), true );
			assert.strictEqual( isPositiveInteger( 100 ), true );
			assert.strictEqual( isPositiveInteger( 999999 ), true );
		} );

		it( 'returns false for zero', () => {
			assert.strictEqual( isPositiveInteger( 0 ), false );
		} );

		it( 'returns false for negative integers', () => {
			assert.strictEqual( isPositiveInteger( -1 ), false );
			assert.strictEqual( isPositiveInteger( -100 ), false );
		} );

		it( 'returns false for non-integers', () => {
			assert.strictEqual( isPositiveInteger( 1.5 ), false );
			assert.strictEqual( isPositiveInteger( 0.1 ), false );
			assert.strictEqual( isPositiveInteger( -0.5 ), false );
		} );

		it( 'returns false for non-number types', () => {
			assert.strictEqual( isPositiveInteger( '1' ), false );
			assert.strictEqual( isPositiveInteger( null ), false );
			assert.strictEqual( isPositiveInteger( undefined ), false );
			assert.strictEqual( isPositiveInteger( {} ), false );
			assert.strictEqual( isPositiveInteger( [] ), false );
			assert.strictEqual( isPositiveInteger( NaN ), false );
			assert.strictEqual( isPositiveInteger( Infinity ), false );
		} );
	} );

	describe( 'isUserConnected', () => {
		it( 'returns true when isConnected is true', () => {
			assert.strictEqual( isUserConnected( { userInfo: { isConnected: true } } as never ), true );
		} );

		it( 'returns false when isConnected is false', () => {
			assert.strictEqual( isUserConnected( { userInfo: { isConnected: false } } as never ), false );
		} );

		it( 'returns true when isConnected is undefined (not explicitly disconnected)', () => {
			assert.strictEqual( isUserConnected( { userInfo: {} } as never ), true );
		} );

		it( 'returns true when userInfo is undefined', () => {
			assert.strictEqual( isUserConnected( {} as never ), true );
		} );

		it( 'returns true when userState is null or undefined', () => {
			assert.strictEqual( isUserConnected( null as never ), true );
			assert.strictEqual( isUserConnected( undefined as never ), true );
		} );
	} );

	describe( 'areUserSetsEqual', () => {
		it( 'returns true for identical sets', () => {
			const set1 = new Set( [ 1, 2, 3 ] );
			const set2 = new Set( [ 1, 2, 3 ] );
			assert.strictEqual( areUserSetsEqual( set1, set2 ), true );
		} );

		it( 'returns true for empty sets', () => {
			const set1 = new Set< number >();
			const set2 = new Set< number >();
			assert.strictEqual( areUserSetsEqual( set1, set2 ), true );
		} );

		it( 'returns true for sets with same elements in different order', () => {
			const set1 = new Set( [ 3, 1, 2 ] );
			const set2 = new Set( [ 1, 2, 3 ] );
			assert.strictEqual( areUserSetsEqual( set1, set2 ), true );
		} );

		it( 'returns false for different sizes', () => {
			const set1 = new Set( [ 1, 2 ] );
			const set2 = new Set( [ 1, 2, 3 ] );
			assert.strictEqual( areUserSetsEqual( set1, set2 ), false );
		} );

		it( 'returns false for same size but different values', () => {
			const set1 = new Set( [ 1, 2, 3 ] );
			const set2 = new Set( [ 1, 2, 4 ] );
			assert.strictEqual( areUserSetsEqual( set1, set2 ), false );
		} );

		it( 'returns false when one set is empty and the other is not', () => {
			const set1 = new Set< number >();
			const set2 = new Set( [ 1 ] );
			assert.strictEqual( areUserSetsEqual( set1, set2 ), false );
		} );
	} );

	describe( 'getConnectedUserIds', () => {
		it( 'returns unique connected user IDs', () => {
			selectMock.mock.mockImplementation( () => ( {
				getActiveUsers: () =>
					new Map( [
						[ 100, { userInfo: { id: 1, isConnected: true } } ],
						[ 101, { userInfo: { id: 2, isConnected: true } } ],
						[ 102, { userInfo: { id: 3, isConnected: true } } ],
					] ),
			} ) );

			const result = getConnectedUserIds();
			assert.deepStrictEqual( result.sort(), [ 1, 2, 3 ] );
		} );

		it( 'deduplicates user IDs from multiple clients', () => {
			selectMock.mock.mockImplementation( () => ( {
				getActiveUsers: () =>
					new Map( [
						[ 100, { userInfo: { id: 1, isConnected: true } } ],
						[ 101, { userInfo: { id: 2, isConnected: true } } ],
						[ 102, { userInfo: { id: 1, isConnected: true } } ], // Same user, different client.
					] ),
			} ) );

			const result = getConnectedUserIds();
			assert.deepStrictEqual( result.sort(), [ 1, 2 ] );
		} );

		it( 'filters out disconnected users', () => {
			selectMock.mock.mockImplementation( () => ( {
				getActiveUsers: () =>
					new Map( [
						[ 100, { userInfo: { id: 1, isConnected: true } } ],
						[ 101, { userInfo: { id: 2, isConnected: false } } ],
						[ 102, { userInfo: { id: 3, isConnected: true } } ],
					] ),
			} ) );

			const result = getConnectedUserIds();
			assert.deepStrictEqual( result.sort(), [ 1, 3 ] );
		} );

		it( 'filters out invalid user IDs', () => {
			selectMock.mock.mockImplementation( () => ( {
				getActiveUsers: () =>
					new Map( [
						[ 100, { userInfo: { id: 1, isConnected: true } } ],
						[ 101, { userInfo: { id: 0, isConnected: true } } ],
						[ 102, { userInfo: { id: -1, isConnected: true } } ],
						[ 103, { userInfo: { id: null, isConnected: true } } ],
						[ 104, { userInfo: { id: 'invalid', isConnected: true } } ],
					] ),
			} ) );

			const result = getConnectedUserIds();
			assert.deepStrictEqual( result, [ 1 ] );
		} );

		it( 'returns empty array when no users are connected', () => {
			selectMock.mock.mockImplementation( () => ( {
				getActiveUsers: () => new Map(),
			} ) );

			const result = getConnectedUserIds();
			assert.deepStrictEqual( result, [] );
		} );

		it( 'returns empty array on error', () => {
			selectMock.mock.mockImplementation( () => {
				throw new Error( 'Store not available' );
			} );

			const result = getConnectedUserIds();
			assert.deepStrictEqual( result, [] );
		} );
	} );

	describe( 'getConnectedUserCount', () => {
		it( 'returns the count of unique connected users', () => {
			selectMock.mock.mockImplementation( () => ( {
				getActiveUsers: () =>
					new Map( [
						[ 100, { userInfo: { id: 1, isConnected: true } } ],
						[ 101, { userInfo: { id: 2, isConnected: true } } ],
						[ 102, { userInfo: { id: 1, isConnected: true } } ], // Duplicate.
					] ),
			} ) );

			const result = getConnectedUserCount();
			assert.strictEqual( result, 2 );
		} );

		it( 'returns 0 when no users are connected', () => {
			selectMock.mock.mockImplementation( () => ( {
				getActiveUsers: () => new Map(),
			} ) );

			const result = getConnectedUserCount();
			assert.strictEqual( result, 0 );
		} );
	} );
} );
