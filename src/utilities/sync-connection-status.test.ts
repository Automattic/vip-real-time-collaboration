import { __dangerousOptInToUnstableAPIsOnlyForCoreModules } from '@wordpress/private-apis';
import assert from 'node:assert';
import { describe, it } from 'node:test';

import { getCoreDataSelectors } from './sync-connection-status';

const PRIVATE_API_CONSENT =
	'I acknowledge private features are not for use in themes or plugins and doing so will break in the next version of WordPress.';

describe( 'getCoreDataSelectors', () => {
	it( 'unlocks private core-data selectors', () => {
		const { lock } = __dangerousOptInToUnstableAPIsOnlyForCoreModules(
			PRIVATE_API_CONSENT,
			'@wordpress/core-data'
		);
		const publicCoreStore = {};
		const expectedStatus = {
			status: 'disconnected' as const,
			error: {
				name: 'WebSocketError',
				message: '',
				code: 'connection-limit-exceeded' as const,
			},
		};

		lock( publicCoreStore, {
			getSyncConnectionStatus: () => expectedStatus,
		} );

		const selectors = getCoreDataSelectors( ( storeName: string ): unknown => {
			assert.strictEqual( storeName, 'core' );
			return publicCoreStore;
		} );

		assert.strictEqual( selectors.getSyncConnectionStatus?.(), expectedStatus );
	} );

	it( 'falls back to public core-data selectors for older Gutenberg', () => {
		const expectedStatus = {
			status: 'disconnected' as const,
			error: {
				name: 'WebSocketError',
				message: '',
				code: 'connection-limit-exceeded' as const,
			},
		};
		const publicCoreStore = {
			getSyncConnectionStatus: () => expectedStatus,
		};

		const selectors = getCoreDataSelectors( ( storeName: string ): unknown => {
			assert.strictEqual( storeName, 'core' );
			return publicCoreStore;
		} );

		assert.strictEqual( selectors.getSyncConnectionStatus?.(), expectedStatus );
	} );

	it( 'uses public sync selectors when private selectors do not include them', () => {
		const { lock } = __dangerousOptInToUnstableAPIsOnlyForCoreModules(
			PRIVATE_API_CONSENT,
			'@wordpress/core-data'
		);
		const expectedStatus = {
			status: 'disconnected' as const,
			error: {
				name: 'WebSocketError',
				message: '',
				code: 'connection-limit-exceeded' as const,
			},
		};
		const expectedPostType = { slug: 'post', labels: { name: 'Posts' } };
		const publicCoreStore = {
			getPostType: ( slug: string ) => {
				assert.strictEqual( slug, 'post' );
				return expectedPostType;
			},
			getSyncConnectionStatus: () => expectedStatus,
		};

		lock( publicCoreStore, {} );

		const selectors = getCoreDataSelectors( ( storeName: string ): unknown => {
			assert.strictEqual( storeName, 'core' );
			return publicCoreStore;
		} );

		assert.strictEqual( selectors.getSyncConnectionStatus?.(), expectedStatus );
		assert.strictEqual( selectors.getPostType?.( 'post' ), expectedPostType );
	} );
} );
