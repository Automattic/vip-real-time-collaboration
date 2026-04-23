import assert from 'node:assert';
import { describe, it } from 'node:test';

import { isForbiddenAuthError } from './error';

describe( 'isForbiddenAuthError', () => {
	it( 'returns true for permission_denied code', () => {
		assert.strictEqual(
			isForbiddenAuthError( { code: 'permission_denied', message: 'No' } ),
			true
		);
	} );

	it( 'returns false for unrelated errors', () => {
		assert.strictEqual( isForbiddenAuthError( null ), false );
		assert.strictEqual( isForbiddenAuthError( new Error( 'fail' ) ), false );
		assert.strictEqual(
			isForbiddenAuthError( {
				code: 'rest_forbidden',
				message: 'Forbidden',
				data: { status: 403 },
			} ),
			false
		);
	} );
} );
