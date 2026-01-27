import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock, type Mock } from 'node:test';

import { createYoastSeoBridge } from './yoast-seo-bridge';

describe( 'Yoast SEO Bridge', () => {
	let mockConsoleLog: Mock< typeof console.log >;

	beforeEach( () => {
		mockConsoleLog = mock.method( console, 'log', () => {} );
	} );

	afterEach( () => {
		mock.restoreAll();
	} );

	describe( 'createYoastSeoBridge', () => {
		it( 'should return a bridge with correct id', () => {
			const bridge = createYoastSeoBridge();
			assert.strictEqual( bridge.id, 'yoast-seo' );
		} );

		it( 'should return a bridge with required methods', () => {
			const bridge = createYoastSeoBridge();

			assert.strictEqual( typeof bridge.isAvailable, 'function' );
			assert.strictEqual( typeof bridge.getFields, 'function' );
			assert.strictEqual( typeof bridge.subscribe, 'function' );
		} );

		it( 'should return three fields for Yoast meta keys', () => {
			const bridge = createYoastSeoBridge();
			const fields = bridge.getFields();

			assert.strictEqual( fields.length, 3 );

			const keys = fields.map( f => f.key );
			assert.ok( keys.includes( '_yoast_wpseo_title' ) );
			assert.ok( keys.includes( '_yoast_wpseo_metadesc' ) );
			assert.ok( keys.includes( '_yoast_wpseo_focuskw' ) );
		} );

		it( 'should return false for isAvailable when Yoast store is not loaded', () => {
			const bridge = createYoastSeoBridge();
			// In test environment, Yoast store is not available
			assert.strictEqual( bridge.isAvailable(), false );
		} );
	} );
} );
