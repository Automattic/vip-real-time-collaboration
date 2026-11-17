<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration\Auth;

use VIPRealTimeCollaboration\Auth\SyncPermissions;
use WP_Error;
use Yoast\WPTestUtils\WPIntegration\TestCase;

/**
 * Integration Tests for SyncPermissions filter examples.
 *
 * These tests demonstrate the permission filtering patterns documented in README.md
 * and verify that the vip_rtc_post_sync_check_permission filter works as expected.
 */
final class SyncPermissionsFilterTest extends TestCase {
	private int $editor_id;
	private int $author_id;
	private int $post_id;
	private int $page_id;
	private int $product_id;

	public function setUp(): void {
		parent::setUp();

		// Create test users with different roles.
		$this->editor_id = self::factory()->user->create( [ 'role' => 'editor' ] );
		$this->author_id = self::factory()->user->create( [ 'role' => 'author' ] );

		// Create test posts of different types.
		$this->post_id = self::factory()->post->create( [
			'post_type' => 'post',
			'post_author' => $this->author_id,
		] );

		$this->page_id = self::factory()->post->create( [
			'post_type' => 'page',
			'post_author' => $this->author_id,
		] );

		// Register and create a custom post type for testing.
		register_post_type( 'product', [
			'public' => true,
			'supports' => [ 'editor' ],
			'capability_type' => 'post',
		] );

		$this->product_id = self::factory()->post->create( [
			'post_type' => 'product',
			'post_author' => $this->author_id,
		] );

		// Initialize SyncPermissions to set up capabilities.
		SyncPermissions::init();
	}

	public function tearDown(): void {
		// Clean up test data and filters.
		remove_all_filters( 'vip_rtc_post_sync_check_permission' );
		unregister_post_type( 'product' );

		parent::tearDown();
	}

	/**
	 * Verifies that permission check works without any filters applied.
	 *
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::can_sync
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::check_post_sync_permissions
	 */
	public function test_permission_check_succeeds_by_default(): void {
		wp_set_current_user( $this->editor_id );

		$result = SyncPermissions::can_sync( 'postType/post', (string) $this->post_id );

		self::assertTrue( $result, 'Editor should be able to sync posts by default' );
	}

	/**
	 * Verifies that post type filtering works as documented in README.md.
	 *
	 * Example from: "Restricting collaboration by post type"
	 *
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::can_sync
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::check_post_sync_permissions
	 */
	public function test_filter_can_exclude_specific_post_types(): void {
		wp_set_current_user( $this->editor_id );

		// Add filter to exclude 'product' post type (as shown in README).
		add_filter( 'vip_rtc_post_sync_check_permission', function ( $result, $post_id ) {
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			$post_type = get_post_type( $post_id );
			$excluded_types = [ 'product', 'private_content' ];

			if ( in_array( $post_type, $excluded_types, true ) ) {
				return new WP_Error(
					'collaboration_disabled',
					'Real-time collaboration is not available for this content type.'
				);
			}

			return $result;
		}, 10, 2 );

		// Regular posts should still work.
		$post_result = SyncPermissions::can_sync( 'postType/post', (string) $this->post_id );
		self::assertTrue( $post_result, 'Regular posts should still be allowed' );

		// Products should be blocked.
		$product_result = SyncPermissions::can_sync( 'postType/product', (string) $this->product_id );
		self::assertInstanceOf( WP_Error::class, $product_result, 'Products should be blocked' );
		self::assertSame( 'collaboration_disabled', $product_result->get_error_code() );
	}

	/**
	 * Verifies that user role filtering works as documented in README.md.
	 *
	 * Example from: "Restricting collaboration by user role"
	 *
	 * This test uses contributors on posts (which they can edit) but restricts
	 * collaboration to only editors and admins via the filter.
	 *
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::can_sync
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::check_post_sync_permissions
	 */
	public function test_filter_can_restrict_by_user_role(): void {
		// Create a contributor who has edit_post capability for their own posts.
		$contributor_id = self::factory()->user->create( [ 'role' => 'contributor' ] );
		$contributor_post_id = self::factory()->post->create( [
			'post_type' => 'post',
			'post_author' => $contributor_id,
			'post_status' => 'draft',
		] );

		// Add filter to restrict posts to editors and admins only (as shown in README).
		add_filter( 'vip_rtc_post_sync_check_permission', function ( $result, $post_id ) {
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			$post_type = get_post_type( $post_id );
			$current_user = wp_get_current_user();

			// Only allow editors and admins to collaborate on posts.
			if ( 'post' === $post_type ) {
				$allowed_roles = [ 'editor', 'administrator' ];
				$user_roles = $current_user->roles;

				if ( empty( array_intersect( $allowed_roles, $user_roles ) ) ) {
					return new WP_Error(
						'insufficient_role',
						'Your user role does not have permission to collaborate on posts.'
					);
				}
			}

			return $result;
		}, 10, 2 );

		// Editor should be able to collaborate on posts.
		wp_set_current_user( $this->editor_id );
		$editor_result = SyncPermissions::can_sync( 'postType/post', (string) $this->post_id );
		self::assertTrue( $editor_result, 'Editor should be able to collaborate on posts' );

		// Contributor should NOT be able to collaborate on posts (despite having edit capability).
		wp_set_current_user( $contributor_id );
		$contributor_result = SyncPermissions::can_sync( 'postType/post', (string) $contributor_post_id );
		self::assertInstanceOf( WP_Error::class, $contributor_result, 'Contributor should be blocked from posts' );
		self::assertSame( 'insufficient_role', $contributor_result->get_error_code() );
	}

	/**
	 * Verifies that post meta filtering works as documented in README.md.
	 *
	 * Example from: "Other permission customizations" - post meta
	 *
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::can_sync
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::check_post_sync_permissions
	 */
	public function test_filter_can_restrict_by_post_meta(): void {
		wp_set_current_user( $this->editor_id );

		// Add filter to check for '_disable_collaboration' meta (as shown in README).
		add_filter( 'vip_rtc_post_sync_check_permission', function ( $result, $post_id ) {
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			if ( get_post_meta( $post_id, '_disable_collaboration', true ) ) {
				return new WP_Error( 'collaboration_disabled', 'Collaboration disabled for this post.' );
			}

			return $result;
		}, 10, 2 );

		// Without meta, collaboration should work.
		$result_without_meta = SyncPermissions::can_sync( 'postType/post', (string) $this->post_id );
		self::assertTrue( $result_without_meta, 'Post without meta should allow collaboration' );

		// Add meta to disable collaboration.
		update_post_meta( $this->post_id, '_disable_collaboration', '1' );

		// Now collaboration should be blocked.
		$result_with_meta = SyncPermissions::can_sync( 'postType/post', (string) $this->post_id );
		self::assertInstanceOf( WP_Error::class, $result_with_meta, 'Post with disable meta should block collaboration' );
		self::assertSame( 'collaboration_disabled', $result_with_meta->get_error_code() );
	}

	/**
	 * Verifies that taxonomy filtering works as documented in README.md.
	 *
	 * Example from: "Other permission customizations" - taxonomy terms
	 *
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::can_sync
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::check_post_sync_permissions
	 */
	public function test_filter_can_restrict_by_taxonomy_terms(): void {
		wp_set_current_user( $this->editor_id );

		// Create a 'sensitive' category.
		$sensitive_term_id = self::factory()->term->create( [
			'name' => 'Sensitive',
			'slug' => 'sensitive',
			'taxonomy' => 'category',
		] );

		// Add filter to block posts with 'sensitive' category (as shown in README).
		add_filter( 'vip_rtc_post_sync_check_permission', function ( $result, $post_id ) {
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			if ( has_term( 'sensitive', 'category', $post_id ) ) {
				return new WP_Error( 'sensitive_content', 'Collaboration not available for sensitive content.' );
			}

			return $result;
		}, 10, 2 );

		// Without the term, collaboration should work.
		$result_without_term = SyncPermissions::can_sync( 'postType/post', (string) $this->post_id );
		self::assertTrue( $result_without_term, 'Post without sensitive term should allow collaboration' );

		// Add the 'sensitive' category to the post.
		wp_set_post_terms( $this->post_id, [ $sensitive_term_id ], 'category' );

		// Now collaboration should be blocked.
		$result_with_term = SyncPermissions::can_sync( 'postType/post', (string) $this->post_id );
		self::assertInstanceOf( WP_Error::class, $result_with_term, 'Post with sensitive term should block collaboration' );
		self::assertSame( 'sensitive_content', $result_with_term->get_error_code() );
	}

	/**
	 * Verifies that filters respect previous WP_Error results.
	 *
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::can_sync
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::check_post_sync_permissions
	 */
	public function test_filter_respects_previous_error_results(): void {
		wp_set_current_user( $this->editor_id );

		// Add two filters - the second should respect the first's error.
		add_filter( 'vip_rtc_post_sync_check_permission', function () {
			return new WP_Error( 'first_error', 'First filter error' );
		}, 10, 0 );

		add_filter( 'vip_rtc_post_sync_check_permission', function ( $result ) {
			// Should return the error from the first filter unchanged.
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			// This should never execute because the first filter returns an error.
			return new WP_Error( 'second_error', 'Second filter error' );
		}, 20, 1 );

		$result = SyncPermissions::can_sync( 'postType/post', (string) $this->post_id );

		self::assertInstanceOf( WP_Error::class, $result, 'Should return WP_Error' );
		self::assertSame( 'first_error', $result->get_error_code(), 'Should preserve the first error' );
	}

	/**
	 * Verifies that multiple filters can be combined.
	 *
	 * Uses content types that the author has base edit permissions for,
	 * then applies multiple filter layers on top.
	 *
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::can_sync
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::check_post_sync_permissions
	 */
	public function test_multiple_filters_can_be_combined(): void {
		// Create a custom post type that authors can edit.
		register_post_type( 'article', [
			'public' => true,
			'supports' => [ 'editor' ],
			'capability_type' => 'post',
		] );

		$article_id = self::factory()->post->create( [
			'post_type' => 'article',
			'post_author' => $this->author_id,
		] );

		wp_set_current_user( $this->author_id );

		// Filter 1: Block products.
		add_filter( 'vip_rtc_post_sync_check_permission', function ( $result, $post_id ) {
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			if ( 'product' === get_post_type( $post_id ) ) {
				return new WP_Error( 'product_blocked', 'Products cannot be collaborated on' );
			}

			return $result;
		}, 10, 2 );

		// Filter 2: Block articles for non-editors.
		add_filter( 'vip_rtc_post_sync_check_permission', function ( $result, $post_id ) {
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			if ( 'article' === get_post_type( $post_id ) ) {
				$current_user = wp_get_current_user();
				if ( ! in_array( 'editor', $current_user->roles, true ) ) {
					return new WP_Error( 'article_blocked', 'Only editors can collaborate on articles' );
				}
			}

			return $result;
		}, 20, 2 );

		// Test that both filters are applied.
		$product_result = SyncPermissions::can_sync( 'postType/product', (string) $this->product_id );
		self::assertInstanceOf( WP_Error::class, $product_result, 'Product should be blocked' );
		self::assertSame( 'product_blocked', $product_result->get_error_code() );

		$article_result = SyncPermissions::can_sync( 'postType/article', (string) $article_id );
		self::assertInstanceOf( WP_Error::class, $article_result, 'Article should be blocked for author' );
		self::assertSame( 'article_blocked', $article_result->get_error_code() );

		// But regular posts should still work.
		$post_result = SyncPermissions::can_sync( 'postType/post', (string) $this->post_id );
		self::assertTrue( $post_result, 'Posts should still be allowed' );

		// Clean up.
		unregister_post_type( 'article' );
	}
}
