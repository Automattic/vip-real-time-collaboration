import { SyncConfig, type ObjectData } from '@wordpress/sync';
import assert from 'node:assert';
import { afterEach, before, describe, it, mock, type Mock } from 'node:test';

describe( 'getHashForEntityRecord', () => {
	let getHashForEntityRecord: typeof import('./entity').getHashForEntityRecord;
	let mockGenerateHash: Mock< typeof import('@/utilities/crypto').generateHash >;

	const syncConfig: SyncConfig = {
		getInitialObjectData: ( { content: _discard, ...record }: ObjectData ) => ( {
			...record,
			blocks: [ { type: 'paragraph', content: 'Block content' } ],
		} ),
		getObjectId: ( { id }: ObjectData ) => id as string,
		objectType: 'test-type',
		syncedProperties: new Set( [ 'id', 'title', 'content', 'blocks', 'date', 'slug' ] ),
		applyChangesToCRDTDoc: () => {},
		getChangesFromCRDTDoc: () => ( {} ),
	};

	before( async () => {
		// These modules access browser globals in their top-level scope which makes
		// it impossible to import the `./entity` module in this file's top-level
		// scope. Therefore, we must mock them and then dynamically import the module
		// under test.
		mock.module( '@wordpress/core-data' );
		mock.module( '@wordpress/data' );

		mockGenerateHash = mock.fn( () => Promise.resolve( 'mocked-hash' ) );
		mock.module( '@/utilities/crypto', {
			namedExports: {
				generateHash: mockGenerateHash,
			},
		} );

		// @ts-expect-error: TS2702 Dynamic import -- used to navigate import issues mentioned above.
		getHashForEntityRecord = ( await import( './entity' ) ).getHashForEntityRecord;
	} );

	afterEach( () => {
		mockGenerateHash.mock.resetCalls();
	} );

	it( 'should ignore blocks and date properties and include content from raw record', async () => {
		const rawRecord = {
			id: 1,
			date: '2024-01-01T00:00:00',
			title: 'Test Post',
			content: 'Raw content from record',
		};

		await getHashForEntityRecord( rawRecord, syncConfig );

		// Verify generateHash was called.
		assert.strictEqual( mockGenerateHash.mock.callCount(), 1 );

		const hashInput = mockGenerateHash.mock.calls[ 0 ]?.arguments[ 0 ];
		const parsedInput = JSON.parse( hashInput ?? '{}' ) as Record< string, unknown >;

		// Should not include blocks or date.
		assert.strictEqual( parsedInput.blocks, undefined );
		assert.strictEqual( parsedInput.date, undefined );

		// Should include content from raw record.
		assert.strictEqual( parsedInput.content, 'Raw content from record' );

		// Should include other synced properties.
		assert.strictEqual( parsedInput.id, 1 );
		assert.strictEqual( parsedInput.title, 'Test Post' );
	} );

	it( 'should sort object keys in the hash input', async () => {
		const rawRecord1 = {
			id: 1,
			date: '2024-01-01T00:00:00',
			title: 'Test Post',
			content: 'Content',
			slug: 'test-post',
		};

		const rawRecord2 = {
			title: 'Test Post',
			id: 1,
			slug: 'test-post',
			date: '2024-01-01T00:00:00',
			content: 'Content',
		};

		await getHashForEntityRecord( rawRecord1, syncConfig );
		await getHashForEntityRecord( rawRecord2, syncConfig );

		// Verify generateHash was called twice.
		assert.strictEqual( mockGenerateHash.mock.callCount(), 2 );

		const hashInput1 = mockGenerateHash.mock.calls[ 0 ]?.arguments[ 0 ];
		const hashInput2 = mockGenerateHash.mock.calls[ 1 ]?.arguments[ 0 ];

		// Both inputs should be identical and valid JSON.
		assert.strictEqual( hashInput1, hashInput2 );

		const parsedInput1 = JSON.parse( hashInput1 ?? 'false' );
		const parsedInput2 = JSON.parse( hashInput2 ?? 'false' );

		assert.strictEqual( typeof parsedInput1, 'object' );
		assert.strictEqual( typeof parsedInput2, 'object' );
		assert.deepStrictEqual( parsedInput1, parsedInput2 );
	} );

	it( 'should handle content as object with raw property', async () => {
		const rawRecord = {
			id: 1,
			title: 'Test Post',
			content: { raw: 'Raw content from object', rendered: 'Rendered content' },
		};

		await getHashForEntityRecord( rawRecord, syncConfig );

		const hashInput = mockGenerateHash.mock.calls[ 0 ]?.arguments[ 0 ];
		const parsedInput = JSON.parse( hashInput ?? '{}' ) as Record< string, unknown >;

		// Should extract raw content from object
		assert.strictEqual( parsedInput.content, 'Raw content from object' );
	} );

	it( 'should handle missing content property', async () => {
		const rawRecord = {
			id: 1,
			title: 'Test Post',
		};

		await getHashForEntityRecord( rawRecord, syncConfig );

		const hashInput = mockGenerateHash.mock.calls[ 0 ]?.arguments[ 0 ];
		const parsedInput = JSON.parse( hashInput ?? '{}' ) as Record< string, unknown >;

		// Should default to empty string for missing content.
		assert.strictEqual( parsedInput.content, '' );
	} );

	it( 'should pass correct algorithm to generateHash', async () => {
		const rawRecord = { id: 1, title: 'Test' };

		await getHashForEntityRecord( rawRecord, syncConfig );

		// Verify generateHash was called with SHA-256 algorithm
		assert.strictEqual( mockGenerateHash.mock.calls[ 0 ]?.arguments[ 1 ], 'SHA-256' );
	} );
} );
