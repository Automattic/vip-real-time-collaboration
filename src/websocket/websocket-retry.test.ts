import assert from 'node:assert';
import { describe, it } from 'node:test';

import { createRetriableConnect, type RetryEligibility } from '../websocket-retry';

function deferred(): {
	promise: Promise< void >;
	resolve: () => void;
} {
	let resolvePromise = (): void => {};
	const promise = new Promise< void >( resolve => {
		resolvePromise = resolve;
	} );
	return { promise, resolve: resolvePromise };
}

describe( 'createRetriableConnect', () => {
	it( 'retries a transient token-fetch failure with provider-owned backoff', async () => {
		const state: RetryEligibility = { attempts: 0, eligible: true };
		const backoff = deferred();
		const waits: number[] = [];
		const connectedGrants: string[] = [];
		let fetchCount = 0;
		const connect = createRetriableConnect( state, {
			fetchGrant: () => {
				fetchCount += 1;
				if ( fetchCount === 1 ) {
					return Promise.reject( new Error( 'temporary REST failure' ) );
				}
				return Promise.resolve( 'fresh-grant' );
			},
			connectWithGrant: grant => connectedGrants.push( grant ),
			getBackoffDelay: attempts => attempts * 1000,
			wait: delay => {
				waits.push( delay );
				return backoff.promise;
			},
		} );

		await connect();
		backoff.resolve();
		await Promise.resolve();
		await Promise.resolve();
		assert.strictEqual( fetchCount, 2 );
		assert.deepStrictEqual( waits, [ 1000 ] );
		assert.deepStrictEqual( connectedGrants, [ 'fresh-grant' ] );
	} );

	it( 'does not fetch after eligibility is cleared during backoff', async () => {
		const state: RetryEligibility = { attempts: 0, eligible: true };
		const backoff = deferred();
		const connectedGrants: string[] = [];
		let fetchCount = 0;
		const connect = createRetriableConnect( state, {
			fetchGrant: () => {
				fetchCount += 1;
				return Promise.resolve( `grant-${ fetchCount }` );
			},
			connectWithGrant: grant => connectedGrants.push( grant ),
			getBackoffDelay: () => 1000,
			wait: () => backoff.promise,
		} );
		await connect();

		const reconnect = connect();
		state.eligible = false;
		backoff.resolve();
		await reconnect;

		assert.strictEqual( fetchCount, 1 );
		assert.deepStrictEqual( connectedGrants, [ 'grant-1' ] );
	} );

	it( 'does not connect after eligibility is cleared during token fetching', async () => {
		const state: RetryEligibility = { attempts: 0, eligible: true };
		let resolveGrant = ( _grant: string ): void => {};
		const grant = new Promise< string >( resolve => {
			resolveGrant = resolve;
		} );
		const connectedGrants: string[] = [];
		const connect = createRetriableConnect( state, {
			fetchGrant: () => grant,
			connectWithGrant: value => connectedGrants.push( value ),
			getBackoffDelay: () => 1000,
			wait: async () => {},
		} );

		const attempt = connect();
		state.eligible = false;
		resolveGrant( 'stale-grant' );
		await attempt;

		assert.deepStrictEqual( connectedGrants, [] );
	} );

	it( 'does not treat adapter construction errors as transient grant failures', async () => {
		const state: RetryEligibility = { attempts: 0, eligible: true };
		let fetchCount = 0;
		const connect = createRetriableConnect( state, {
			fetchGrant: () => {
				fetchCount += 1;
				return Promise.resolve( 'grant-1' );
			},
			connectWithGrant: () => {
				throw new Error( 'Room is already registered' );
			},
			getBackoffDelay: () => 1000,
			wait: async () => {},
		} );

		await assert.rejects( connect(), /already registered/ );
		assert.strictEqual( fetchCount, 1 );
	} );
} );
