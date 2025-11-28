import assert from 'node:assert';
import { afterEach, before, beforeEach, describe, it, mock, type Mock } from 'node:test';
import * as Y from 'yjs';

import type { Logger } from '@/utilities/logger';
import type { Awareness } from 'y-protocols/awareness';

describe( 'SessionStats', () => {
	let SessionStats: typeof import('@/telemetry/session-stats/SessionStats').SessionStats;
	let mockAwareness: Partial< Awareness > & { doc: Y.Doc; clientID: number };
	let mockLogger: Logger;
	let mockLoggerInfo: Mock< ( ...args: unknown[] ) => void >;
	let mockLoggerDebug: Mock< ( ...args: unknown[] ) => void >;
	let getCurrentPostIdMock: Mock< () => number | string | null >;

	before( async () => {
		getCurrentPostIdMock = mock.fn( () => 123 );

		// Mock WordPress dependencies.
		mock.module( '@wordpress/data', {
			namedExports: {
				select: mock.fn( () => ( {
					getCurrentPostId: getCurrentPostIdMock,
				} ) ),
				register: mock.fn(),
				createReduxStore: mock.fn(),
			},
		} );
		mock.module( '@wordpress/editor', {
			namedExports: { store: 'editor-store' },
		} );

		// Mock store dependencies.
		mock.module( '@/store/awareness-store', {
			namedExports: {
				store: 'mock-awareness-store',
			},
		} );

		// Mock utilities that might have side effects.
		mock.module( '@/utilities/config', {
			namedExports: { isDevelopment: () => true },
		} );

		// @ts-expect-error: TS1323 Dynamic import.
		const module = await import( '@/telemetry/session-stats/SessionStats' );
		SessionStats = module.SessionStats;
	} );

	beforeEach( () => {
		const doc = new Y.Doc();
		mockAwareness = {
			doc,
			clientID: 1,
			getStates: () =>
				new Map( [
					[ 1, {} ],
					[ 2, {} ],
				] ),
		};
		mockLoggerInfo = mock.fn();
		mockLoggerDebug = mock.fn();
		mockLogger = {
			info: mockLoggerInfo,
			debug: mockLoggerDebug,
		} as unknown as Logger;
	} );

	afterEach( () => {
		mockAwareness.doc.destroy();
	} );

	describe( 'constructor', () => {
		it( 'creates instance successfully with valid awareness', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			assert.ok( stats );
		} );

		it( 'throws error when awareness document is not available', () => {
			const invalidAwareness = { clientID: 1 } as Awareness;

			assert.throws(
				() => new SessionStats( invalidAwareness, mockLogger ),
				/Awareness document is not available/
			);
		} );
	} );

	describe( 'initializeStats', () => {
		it( 'initializes stats with valid user IDs', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );

			const result = stats.initializeStats( [ 1, 2 ] );

			assert.strictEqual( result, true );
			assert.strictEqual( stats.isRecordingStats(), true );
			assert.strictEqual( mockLoggerInfo.mock.callCount(), 1 );
		} );

		it( 'returns false with fewer than 2 users', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );

			const result = stats.initializeStats( [ 1 ] );

			assert.strictEqual( result, false );
			assert.strictEqual( stats.isRecordingStats(), false );
		} );

		it( 'returns false with empty user array', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );

			const result = stats.initializeStats( [] );

			assert.strictEqual( result, false );
			assert.strictEqual( stats.isRecordingStats(), false );
		} );

		it( 'returns false if already recording', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			const result = stats.initializeStats( [ 1, 2, 3 ] );

			assert.strictEqual( result, false );
		} );

		it( 'filters out invalid user IDs during initialization', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );

			// Only 2 valid IDs (1 and 2), others are invalid.
			const result = stats.initializeStats( [ 1, 0, -1, 2 ] );

			assert.strictEqual( result, true );

			const exported = stats.exportStats();
			assert.strictEqual( exported?.usersTotal, 2 );
		} );

		it( 'sets session initializer client ID', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			assert.strictEqual( stats.getSessionInitializerClientId(), 1 );
		} );
	} );

	describe( 'exportStats', () => {
		it( 'exports stats and resets state', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );
			stats.addUserToActiveUsers( 1 );

			const exported = stats.exportStats();

			assert.notStrictEqual( exported, null );
			assert.strictEqual( exported?.usersTotal, 2 );
			assert.strictEqual( exported?.usersActive, 1 );
			assert.strictEqual( exported?.usersInactive, 1 );
			assert.strictEqual( exported?.postId, 123 );
			assert.strictEqual( typeof exported?.timestamp, 'number' );
			assert.strictEqual( typeof exported?.sessionDuration, 'number' );
			assert.strictEqual( stats.isRecordingStats(), false );
		} );

		it( 'returns null if not recording', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );

			const exported = stats.exportStats();

			assert.strictEqual( exported, null );
		} );

		it( 'resets session state after export', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );
			stats.exportStats();

			assert.strictEqual( stats.getSessionInitializerClientId(), null );
			assert.strictEqual( stats.getLastActivityTime(), null );
		} );

		it( 'includes expiredByInactivity flag', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );
			stats.setSessionExpired( true );

			const exported = stats.exportStats();

			assert.strictEqual( exported?.expiredByInactivity, true );
		} );
	} );

	describe( 'addUserToActiveUsers', () => {
		it( 'adds valid user IDs', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			stats.addUserToActiveUsers( 1 );
			const exported = stats.exportStats();

			assert.strictEqual( exported?.usersActive, 1 );
		} );

		it( 'ignores invalid user IDs', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			stats.addUserToActiveUsers( -1 );
			stats.addUserToActiveUsers( 0 );
			const exported = stats.exportStats();

			assert.strictEqual( exported?.usersActive, 0 );
		} );

		it( 'does not add duplicate user IDs', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			stats.addUserToActiveUsers( 1 );
			stats.addUserToActiveUsers( 1 );
			stats.addUserToActiveUsers( 1 );
			const exported = stats.exportStats();

			assert.strictEqual( exported?.usersActive, 1 );
		} );

		it( 'does nothing when activeUserIds is not initialized', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );

			// Should not throw.
			stats.addUserToActiveUsers( 1 );

			assert.ok( true );
		} );
	} );

	describe( 'addUsersToAllUsers', () => {
		it( 'adds multiple user IDs', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			stats.addUsersToAllUsers( [ 3, 4 ] );
			const exported = stats.exportStats();

			assert.strictEqual( exported?.usersTotal, 4 );
		} );

		it( 'ignores invalid user IDs', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			stats.addUsersToAllUsers( [ -1, 0, 3 ] );
			const exported = stats.exportStats();

			assert.strictEqual( exported?.usersTotal, 3 );
		} );

		it( 'does not add duplicate user IDs', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			stats.addUsersToAllUsers( [ 1, 2, 3 ] );
			const exported = stats.exportStats();

			assert.strictEqual( exported?.usersTotal, 3 );
		} );

		it( 'handles empty array', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			stats.addUsersToAllUsers( [] );
			const exported = stats.exportStats();

			assert.strictEqual( exported?.usersTotal, 2 );
		} );

		it( 'does nothing when allUserIds is not initialized', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );

			// Should not throw.
			stats.addUsersToAllUsers( [ 1, 2 ] );

			assert.ok( true );
		} );
	} );

	describe( 'updateLastActivityTime', () => {
		it( 'updates last activity time when state coordinator', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			const timeBefore = stats.getLastActivityTime();
			stats.updateLastActivityTime();
			const timeAfter = stats.getLastActivityTime();

			assert.ok( timeAfter !== null );
			assert.ok( timeBefore !== null );
			assert.ok( timeAfter >= timeBefore );
		} );
	} );

	describe( 'isSessionOwner', () => {
		it( 'returns true for session initializer', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			assert.strictEqual( stats.isSessionOwner(), true );
		} );

		it( 'returns false for non-initializer when initializer is connected', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			// Change client ID to simulate different client.
			mockAwareness.clientID = 2;

			assert.strictEqual( stats.isSessionOwner(), false );
		} );

		it( 'falls back to lowest client ID when initializer disconnects', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			// Simulate initializer disconnecting.
			mockAwareness.getStates = () =>
				new Map( [
					[ 2, {} ],
					[ 3, {} ],
				] );
			mockAwareness.clientID = 2;

			assert.strictEqual( stats.isSessionOwner(), true );
		} );
	} );

	describe( 'isSessionExpired', () => {
		it( 'returns false by default', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );

			assert.strictEqual( stats.isSessionExpired(), false );
		} );

		it( 'returns true after setSessionExpired(true)', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );
			stats.setSessionExpired( true );

			assert.strictEqual( stats.isSessionExpired(), true );
		} );
	} );

	describe( 'getLastActivityTime', () => {
		it( 'returns null when not initialized', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );

			assert.strictEqual( stats.getLastActivityTime(), null );
		} );

		it( 'returns timestamp after initialization', () => {
			const stats = new SessionStats( mockAwareness as Awareness, mockLogger );
			stats.initializeStats( [ 1, 2 ] );

			const lastActivityTime = stats.getLastActivityTime();
			assert.ok( lastActivityTime !== null );
			assert.ok( lastActivityTime > 0 );
		} );
	} );
} );
