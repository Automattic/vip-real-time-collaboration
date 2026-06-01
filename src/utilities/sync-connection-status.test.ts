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
} );
