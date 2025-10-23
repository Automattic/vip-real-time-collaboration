<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Editor;

use VIPRealTimeCollaboration\Auth\SyncPermissions;
use WP_Post;
use WP_User;
use function add_filter;
use function get_user_by;
use function wp_check_post_lock;

defined( 'ABSPATH' ) || exit();

/**
 * Provides additional context to the built-in post locking functionality to
 * ensure compatibility with real-time collaboration.
 */
final class PostLock {
	public function __construct() {
		add_filter( 'block_editor_settings_all', [ $this, 'enhance_post_lock_user' ], 50, 1 );
		add_filter( 'heartbeat_received', [ $this, 'enhance_heartbeat_response' ], 500, 2 );
	}

	/**
	 * Add a `syncEnabled` property on the block editor post lock settings.
	 *
	 * @param array{
	 *   postLock: array{
	 *     isLocked: bool,
	 *     user: array{
	 *       syncEnabled: bool,
	 *    },
	 *  },
	 * } $settings Block editor settings.
	 * @psalm-suppress PossiblyUnusedReturnValue
	 */
	public function enhance_post_lock_user( array $settings ): array {
		global $post;

		if ( $post instanceof WP_Post && true === ( $settings['postLock']['isLocked'] ?? false ) && isset( $settings['postLock']['user'] ) ) {
			$sync_enabled = false;

			// Get the lock owner.
			$lock_owner_id = wp_check_post_lock( $post );
			if ( $lock_owner_id > 0 ) {
				$lock_owner = get_user_by( 'id', $lock_owner_id );

				if ( $lock_owner instanceof WP_User ) {
					$sync_enabled = $lock_owner->has_cap( SyncPermissions::CAP_NAME, $post->ID );
				}
			}

			$settings['postLock']['user']['syncEnabled'] = $sync_enabled;
		}

		return $settings;
	}

	/**
	 * Add the `syncEnabled` property on the heartbeat post lock response.
	 *
	 * @param array{
	 *   wp-refresh-post-lock: array{
	 *     lock_error: array {
	 *       syncEnabled: bool,
	 *     },
	 *   },
	 * } $response Heartbeat response.
	 * @param array{
	 *   wp-refresh-post-lock: array{
	 *     post_id: int,
	 *   },
	 * } $data     Heartbeat request data.
	 * @psalm-suppress PossiblyUnusedReturnValue
	 */
	public function enhance_heartbeat_response( array $response, array $data ): array {
		if ( isset( $response['wp-refresh-post-lock']['lock_error'], $data['wp-refresh-post-lock']['post_id'] ) ) {
			$post_id = intval( $data['wp-refresh-post-lock']['post_id'] );
			$sync_enabled = false;

			$lock_owner_id = wp_check_post_lock( $post_id );
			if ( $lock_owner_id > 0 ) {
				$lock_owner = get_user_by( 'id', $lock_owner_id );

				if ( $lock_owner instanceof WP_User ) {
					$sync_enabled = $lock_owner->has_cap( SyncPermissions::CAP_NAME, $post_id );
				}
			}

			$response['wp-refresh-post-lock']['lock_error']['syncEnabled'] = $sync_enabled;
		}

		return $response;
	}
}
