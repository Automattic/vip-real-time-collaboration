<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration\Auth;

use VIPRealTimeCollaboration\Auth\SyncPermissions;
use WP_UnitTestCase;

final class SyncPermissionsTest extends WP_UnitTestCase {
	public function set_up(): void {
		parent::set_up();
		add_filter( 'map_meta_cap', [ SyncPermissions::class, 'map_sync_capabilities' ], 10, 4 );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::map_sync_capabilities
	 */
	public function test_null_capability_preserves_primitive_capabilities(): void {
		self::assertSame( [ null ], apply_filters( 'map_meta_cap', [ null ], null, 0, [] ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::map_sync_capabilities
	 */
	public function test_unrelated_capability_preserves_primitive_capabilities(): void {
		self::assertSame( [ 'read' ], apply_filters( 'map_meta_cap', [ 'read' ], 'read', 0, [] ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::map_sync_capabilities
	 */
	public function test_sync_post_allows_author_to_sync_own_post(): void {
		$author_id = self::factory()->user->create( [ 'role' => 'author' ] );
		$post_id = self::factory()->post->create( [ 'post_author' => $author_id ] );

		self::assertSame( map_meta_cap( 'edit_post', $author_id, $post_id ), map_meta_cap( 'sync_post', $author_id, $post_id ) );
		self::assertTrue( user_can( $author_id, 'sync_post', $post_id ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Auth\SyncPermissions::map_sync_capabilities
	 */
	public function test_sync_post_denies_subscriber(): void {
		$subscriber_id = self::factory()->user->create( [ 'role' => 'subscriber' ] );
		$post_id = self::factory()->post->create();

		self::assertSame( map_meta_cap( 'edit_post', $subscriber_id, $post_id ), map_meta_cap( 'sync_post', $subscriber_id, $post_id ) );
		self::assertFalse( user_can( $subscriber_id, 'sync_post', $post_id ) );
	}
}
