import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock, type Mock } from 'node:test';

import { UserInactivityTimer } from '@/telemetry/session-stats/UserInactivityTimer';

describe( 'UserInactivityTimer', () => {
	let timer: UserInactivityTimer;
	let getLastActivityMock: Mock< () => number | null >;
	let onTimeoutMock: Mock< () => void >;
	let mockActivityTime: number | null;

	beforeEach( () => {
		mock.timers.enable( { apis: [ 'setTimeout', 'Date' ] } );
		mockActivityTime = Date.now();
		getLastActivityMock = mock.fn( () => mockActivityTime );
		onTimeoutMock = mock.fn( () => {} );
		timer = new UserInactivityTimer( 5000, getLastActivityMock, onTimeoutMock );
	} );

	afterEach( () => {
		timer.stop();
		mock.timers.reset();
	} );

	describe( 'start', () => {
		it( 'triggers onTimeout after timeout period when last activity is old', () => {
			mockActivityTime = Date.now() - 6000;

			timer.start();
			mock.timers.tick( 5000 );

			assert.strictEqual( onTimeoutMock.mock.callCount(), 1 );
		} );

		it( 'restarts timer if activity occurred within timeout period', () => {
			// Activity will be recent when checked (within 5 second timeout).
			mockActivityTime = Date.now() + 5000 - 2000;

			timer.start();
			mock.timers.tick( 5000 );

			// Should not trigger timeout because activity was recent.
			assert.strictEqual( onTimeoutMock.mock.callCount(), 0 );
		} );

		it( 'triggers onTimeout when lastActivity is null', () => {
			mockActivityTime = null;

			timer.start();
			mock.timers.tick( 5000 );

			assert.strictEqual( onTimeoutMock.mock.callCount(), 1 );
		} );

		it( 'clears previous timer when called multiple times', () => {
			mockActivityTime = Date.now() - 6000;

			timer.start();
			mock.timers.tick( 2000 );
			timer.start(); // Restart.
			mock.timers.tick( 2000 );

			// Should not trigger because timer was restarted.
			assert.strictEqual( onTimeoutMock.mock.callCount(), 0 );

			mock.timers.tick( 3000 );

			// Now it should trigger.
			assert.strictEqual( onTimeoutMock.mock.callCount(), 1 );
		} );
	} );

	describe( 'restart', () => {
		it( 'is an alias of start', () => {
			mockActivityTime = Date.now() - 6000;

			timer.restart();
			mock.timers.tick( 5000 );

			assert.strictEqual( onTimeoutMock.mock.callCount(), 1 );
		} );
	} );

	describe( 'stop', () => {
		it( 'prevents timeout callback from firing', () => {
			mockActivityTime = Date.now() - 6000;

			timer.start();
			timer.stop();
			mock.timers.tick( 5000 );

			assert.strictEqual( onTimeoutMock.mock.callCount(), 0 );
		} );

		it( 'can be called multiple times safely', () => {
			timer.stop();
			timer.stop();
			timer.stop();

			// Should not throw.
			assert.ok( true );
		} );

		it( 'can be called without starting', () => {
			timer.stop();

			// Should not throw.
			assert.ok( true );
		} );
	} );

	describe( 'getTimeoutMs', () => {
		it( 'returns configured timeout', () => {
			assert.strictEqual( timer.getTimeoutMs(), 5000 );
		} );

		it( 'returns correct value for different configurations', () => {
			const timer2 = new UserInactivityTimer( 10000, getLastActivityMock, onTimeoutMock );
			assert.strictEqual( timer2.getTimeoutMs(), 10000 );
			timer2.stop();
		} );
	} );

	describe( 'handleTimeout behavior', () => {
		it( 'reschedules timer when activity is within threshold', () => {
			mockActivityTime = Date.now();

			timer.start();

			// Update activity time to be recent.
			mockActivityTime = Date.now() + 4000;
			mock.timers.tick( 5000 );

			// Timer should reschedule, not fire callback.
			assert.strictEqual( onTimeoutMock.mock.callCount(), 0 );

			// Now let the activity become old.
			mock.timers.tick( 5000 );

			// Now it should fire.
			assert.strictEqual( onTimeoutMock.mock.callCount(), 1 );
		} );
	} );
} );
