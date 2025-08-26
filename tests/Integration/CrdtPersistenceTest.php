<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration;

use VIPRealTimeCollaboration\Editor\CrdtPersistence;
use VIPRealTimeCollaboration\Tests\Traits\ReflectionUtils;
use WP_Error;
use Yoast\WPTestUtils\WPIntegration\TestCase;

/**
 * Integration Tests for the CrdtPersistence class.
 */
final class CrdtPersistenceTest extends TestCase {
	use ReflectionUtils;

	private CrdtPersistence $crdt_persistence;
	private int $test_post_id;

	public function set_up(): void {
		parent::set_up();
		$this->crdt_persistence = new CrdtPersistence();
		$this->test_post_id = $this->factory()->post->create( [ 'post_content' => 'Test post content' ] );
	}

	public function tear_down(): void {
		delete_post_meta( $this->test_post_id, CrdtPersistence::POST_META_KEY );
		parent::tear_down();
	}

	/**
	 * Tests get_crdt_doc() when no CRDT document exists.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::get_crdt_doc
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_meta_value
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_get_crdt_doc_returns_error_when_no_document_exists(): void {
		$result = $this->crdt_persistence->get_crdt_doc( $this->test_post_id, CrdtPersistence::CRDT_DOC_VERSION );

		self::assertInstanceOf( WP_Error::class, $result );
		self::assertSame( 'vip_rtc_invalid_crdt_meta_value', $result->get_error_code() );
		self::assertSame( 'CRDT document meta value is an invalid format.', $result->get_error_message() );
	}

	/**
	 * Tests get_crdt_doc() when a valid CRDT document exists.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::get_crdt_doc
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_meta_value
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_get_crdt_doc_returns_document_when_valid_document_exists(): void {
		$test_doc = base64_encode( 'test crdt document data' );
		$meta_value = [
			'contentHash' => '172bf766b185ede5fdad97f7f4eb0a3b73f874f7dace3ecc0c5f978faae40d4a',
			'doc' => $test_doc,
			'version' => CrdtPersistence::CRDT_DOC_VERSION,
		];

		update_post_meta( $this->test_post_id, CrdtPersistence::POST_META_KEY, $meta_value );

		$result = $this->crdt_persistence->get_crdt_doc( $this->test_post_id, CrdtPersistence::CRDT_DOC_VERSION );

		self::assertSame( $test_doc, $result );
	}

	/**
	 * Tests get_crdt_doc() when content hash mismatch occurs.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::get_crdt_doc
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_meta_value
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_get_crdt_doc_returns_error_on_content_hash_mismatch(): void {
		$test_doc = base64_encode( 'test crdt document data' );
		$meta_value = [
			'contentHash' => 'invalid hash',
			'doc' => $test_doc,
			'version' => CrdtPersistence::CRDT_DOC_VERSION,
		];

		update_post_meta( $this->test_post_id, CrdtPersistence::POST_META_KEY, $meta_value );

		$result = $this->crdt_persistence->get_crdt_doc( $this->test_post_id, 999 );

		self::assertInstanceOf( WP_Error::class, $result );
		self::assertSame( 'vip_rtc_invalid_content_hash', $result->get_error_code() );
		self::assertSame( 'CRDT document content hash is invalid.', $result->get_error_message() );
	}

	/**
	 * Tests get_crdt_doc() when version mismatch occurs.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::get_crdt_doc
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_meta_value
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_get_crdt_doc_returns_error_on_version_mismatch(): void {
		$test_doc = base64_encode( 'test crdt document data' );
		$meta_value = [
			'contentHash' => '172bf766b185ede5fdad97f7f4eb0a3b73f874f7dace3ecc0c5f978faae40d4a',
			'doc' => $test_doc,
			'version' => CrdtPersistence::CRDT_DOC_VERSION,
		];

		update_post_meta( $this->test_post_id, CrdtPersistence::POST_META_KEY, $meta_value );

		$result = $this->crdt_persistence->get_crdt_doc( $this->test_post_id, 999 );

		self::assertInstanceOf( WP_Error::class, $result );
		self::assertSame( 'vip_rtc_crdt_version_mismatch', $result->get_error_code() );
		self::assertSame( 'CRDT document version does not match expected version.', $result->get_error_message() );
	}

	/**
	 * Tests update_crdt_doc() with valid parameters.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::update_crdt_doc
	 */
	public function test_update_crdt_doc_successfully_saves_document(): void {
		$test_doc = base64_encode( 'test crdt document data' );

		$result = $this->crdt_persistence->update_crdt_doc(
			$this->test_post_id,
			$test_doc,
			'172bf766b185ede5fdad97f7f4eb0a3b73f874f7dace3ecc0c5f978faae40d4a',
			CrdtPersistence::CRDT_DOC_VERSION,
			false
		);

		self::assertSame( $test_doc, $result );

		$saved_meta = get_post_meta( $this->test_post_id, CrdtPersistence::POST_META_KEY, true );
		self::assertSame( $test_doc, $saved_meta['doc'] );
		self::assertSame( CrdtPersistence::CRDT_DOC_VERSION, $saved_meta['version'] );
	}

	/**
	 * Tests update_crdt_doc() with invalid content hash.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::update_crdt_doc
	 */
	public function test_update_crdt_doc_returns_error_on_invalid_content_hash(): void {
		$test_doc = base64_encode( 'test crdt document data' );

		$result = $this->crdt_persistence->update_crdt_doc(
			$this->test_post_id,
			$test_doc,
			'invalid hash',
			CrdtPersistence::CRDT_DOC_VERSION,
			false
		);

		self::assertInstanceOf( WP_Error::class, $result );
		self::assertSame( 'vip_rtc_update_content_hash_invalid', $result->get_error_code() );
		self::assertSame( 'Content hash does not match expected value.', $result->get_error_message() );
	}

	/**
	 * Tests update_crdt_doc() with invalid version.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::update_crdt_doc
	 */
	public function test_update_crdt_doc_returns_error_on_invalid_version(): void {
		$test_doc = base64_encode( 'test crdt document data' );

		$result = $this->crdt_persistence->update_crdt_doc(
			$this->test_post_id,
			$test_doc,
			'172bf766b185ede5fdad97f7f4eb0a3b73f874f7dace3ecc0c5f978faae40d4a',
			999,
			false
		);

		self::assertInstanceOf( WP_Error::class, $result );
		self::assertSame( 'vip_rtc_update_crdt_doc_failed', $result->get_error_code() );
		self::assertSame( 'Invalid CRDT document version.', $result->get_error_message() );
	}

	/**
	 * Tests update_crdt_doc() with initial update when document doesn't exist.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::update_crdt_doc
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::get_crdt_doc
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_meta_value
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_update_crdt_doc_initial_update_creates_new_document(): void {
		$test_doc = base64_encode( 'test crdt document data' );

		$result = $this->crdt_persistence->update_crdt_doc(
			$this->test_post_id,
			$test_doc,
			'172bf766b185ede5fdad97f7f4eb0a3b73f874f7dace3ecc0c5f978faae40d4a',
			CrdtPersistence::CRDT_DOC_VERSION,
			true
		);

		self::assertSame( $test_doc, $result );

		$saved_meta = get_post_meta( $this->test_post_id, CrdtPersistence::POST_META_KEY, true );
		self::assertSame( $test_doc, $saved_meta['doc'] );
	}

	/**
	 * Tests update_crdt_doc() with initial update when document already exists.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::update_crdt_doc
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::get_crdt_doc
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_meta_value
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_update_crdt_doc_initial_update_returns_existing_document(): void {
		$existing_doc = base64_encode( 'existing crdt document' );
		$new_doc = base64_encode( 'new crdt document' );

		$existing_meta = [
			'contentHash' => '172bf766b185ede5fdad97f7f4eb0a3b73f874f7dace3ecc0c5f978faae40d4a',
			'doc' => $existing_doc,
			'version' => CrdtPersistence::CRDT_DOC_VERSION,
		];
		update_post_meta( $this->test_post_id, CrdtPersistence::POST_META_KEY, $existing_meta );

		$result = $this->crdt_persistence->update_crdt_doc(
			$this->test_post_id,
			$new_doc,
			'172bf766b185ede5fdad97f7f4eb0a3b73f874f7dace3ecc0c5f978faae40d4a',
			CrdtPersistence::CRDT_DOC_VERSION,
			true
		);

		self::assertSame( $existing_doc, $result );

		$saved_meta = get_post_meta( $this->test_post_id, CrdtPersistence::POST_META_KEY, true );
		self::assertSame( $existing_doc, $saved_meta['doc'] );
	}

	/**
	 * Tests validate_crdt_doc() with valid Base64 string.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_validate_crdt_doc_returns_true_for_valid_base64(): void {
		$valid_doc = base64_encode( 'valid crdt document data' );

		$result = $this->crdt_persistence->validate_crdt_doc( $valid_doc );

		self::assertTrue( $result );
	}

	/**
	 * Tests validate_crdt_doc() with invalid Base64 string.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_validate_crdt_doc_returns_false_for_invalid_base64(): void {
		$invalid_doc = 'invalid base64 string!@#$';

		$result = $this->crdt_persistence->validate_crdt_doc( $invalid_doc );

		self::assertFalse( $result );
	}

	/**
	 * Tests validate_crdt_doc() with empty string.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_validate_crdt_doc_returns_false_for_empty_string(): void {
		$result = $this->crdt_persistence->validate_crdt_doc( '' );

		self::assertFalse( $result );
	}

	/**
	 * Tests validate_crdt_doc() with non-string values.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_validate_crdt_doc_returns_false_for_non_string(): void {
		self::assertFalse( $this->crdt_persistence->validate_crdt_doc( null ) );
		self::assertFalse( $this->crdt_persistence->validate_crdt_doc( 123 ) );
		self::assertFalse( $this->crdt_persistence->validate_crdt_doc( [] ) );
		self::assertFalse( $this->crdt_persistence->validate_crdt_doc( new \stdClass() ) );
	}

	/**
	 * Tests validate_meta_value() with valid meta structure.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_meta_value
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_validate_meta_value_returns_true_for_valid_structure(): void {
		$validate_meta_value = self::get_method( 'validate_meta_value', CrdtPersistence::class );

		$valid_meta = [
			'contentHash' => '172bf766b185ede5fdad97f7f4eb0a3b73f874f7dace3ecc0c5f978faae40d4a',
			'doc' => base64_encode( 'valid document' ),
			'version' => CrdtPersistence::CRDT_DOC_VERSION,
		];

		$result = $validate_meta_value->invoke(
			$this->crdt_persistence,
			$valid_meta,
			$this->test_post_id,
			CrdtPersistence::CRDT_DOC_VERSION
		);

		self::assertTrue( $result );
	}

	/**
	 * Tests validate_meta_value() with invalid meta structure (not array).
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_meta_value
	 */
	public function test_validate_meta_value_returns_error_for_non_array(): void {
		$validate_meta_value = self::get_method( 'validate_meta_value', CrdtPersistence::class );

		$result = $validate_meta_value->invoke(
			$this->crdt_persistence,
			'not an array',
			$this->test_post_id,
			CrdtPersistence::CRDT_DOC_VERSION
		);

		self::assertInstanceOf( WP_Error::class, $result );
		self::assertSame( 'vip_rtc_invalid_crdt_meta_value', $result->get_error_code() );
		self::assertSame( 'CRDT document meta value is an invalid format.', $result->get_error_message() );
	}

	/**
	 * Tests validate_meta_value() with invalid content hash in meta.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_meta_value
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_validate_meta_value_returns_error_for_invalid_content_hash(): void {
		$validate_meta_value = self::get_method( 'validate_meta_value', CrdtPersistence::class );

		$invalid_meta = [
			'contentHash' => 'invalid hash',
			'doc' => base64_encode( 'valid document' ),
			'version' => CrdtPersistence::CRDT_DOC_VERSION,
		];

		$result = $validate_meta_value->invoke(
			$this->crdt_persistence,
			$invalid_meta,
			$this->test_post_id,
			CrdtPersistence::CRDT_DOC_VERSION
		);

		self::assertInstanceOf( WP_Error::class, $result );
		self::assertSame( 'vip_rtc_invalid_content_hash', $result->get_error_code() );
		self::assertSame( 'CRDT document content hash is invalid.', $result->get_error_message() );
	}

	/**
	 * Tests validate_meta_value() with invalid document in meta.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_meta_value
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_validate_meta_value_returns_error_for_invalid_document(): void {
		$validate_meta_value = self::get_method( 'validate_meta_value', CrdtPersistence::class );

		$invalid_meta = [
			'contentHash' => '172bf766b185ede5fdad97f7f4eb0a3b73f874f7dace3ecc0c5f978faae40d4a',
			'doc' => 'invalid base64!@#$',
			'version' => CrdtPersistence::CRDT_DOC_VERSION,
		];

		$result = $validate_meta_value->invoke(
			$this->crdt_persistence,
			$invalid_meta,
			$this->test_post_id,
			CrdtPersistence::CRDT_DOC_VERSION
		);

		self::assertInstanceOf( WP_Error::class, $result );
		self::assertSame( 'vip_rtc_invalid_crdt_doc', $result->get_error_code() );
		self::assertSame( 'CRDT document is invalid.', $result->get_error_message() );
	}

	/**
	 * Tests validate_meta_value() with version mismatch.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_meta_value
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_validate_meta_value_returns_error_for_version_mismatch(): void {
		$validate_meta_value = self::get_method( 'validate_meta_value', CrdtPersistence::class );

		$meta_with_wrong_version = [
			'contentHash' => '172bf766b185ede5fdad97f7f4eb0a3b73f874f7dace3ecc0c5f978faae40d4a',
			'doc' => base64_encode( 'valid document' ),
			'version' => CrdtPersistence::CRDT_DOC_VERSION,
		];

		$result = $validate_meta_value->invoke(
			$this->crdt_persistence,
			$meta_with_wrong_version,
			$this->test_post_id,
			999
		);

		self::assertInstanceOf( WP_Error::class, $result );
		self::assertSame( 'vip_rtc_crdt_version_mismatch', $result->get_error_code() );
		self::assertSame( 'CRDT document version does not match expected version.', $result->get_error_message() );
	}

	/**
	 * Tests validate_meta_value() with missing version in meta.
	 *
	 * @covers \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_meta_value
	 * @uses \VIPRealTimeCollaboration\Editor\CrdtPersistence::validate_crdt_doc
	 */
	public function test_validate_meta_value_returns_error_for_missing_version(): void {
		$validate_meta_value = self::get_method( 'validate_meta_value', CrdtPersistence::class );

		$meta_without_version = [
			'contentHash' => '172bf766b185ede5fdad97f7f4eb0a3b73f874f7dace3ecc0c5f978faae40d4a',
			'doc' => base64_encode( 'valid document' ),
		];

		$result = $validate_meta_value->invoke(
			$this->crdt_persistence,
			$meta_without_version,
			$this->test_post_id,
			CrdtPersistence::CRDT_DOC_VERSION
		);

		self::assertInstanceOf( WP_Error::class, $result );
		self::assertSame( 'vip_rtc_invalid_crdt_version', $result->get_error_code() );
		self::assertSame( 'CRDT document version is invalid.', $result->get_error_message() );
	}
}
