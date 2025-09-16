<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Overrides;

defined( 'ABSPATH' ) || exit();

use function add_filter;

/**
 * Class to handle overrides for the Block Editor functionality.
 *
 * This class disables the post lock functionality in the Block Editor,
 * allowing multiple users to edit the same post simultaneously.
 */
final class Overrides {
	/**
	 * Constructor to initialize the overrides.
	 */
	public function __construct() {
		// Allow multiple users to see the edit post screen. There is a bug with this however, when autosave kicks in, see: https://core.trac.wordpress.org/ticket/63598.
		add_filter( 'show_post_locked_dialog', '__return_false' );

		add_filter( 'heartbeat_received', [ $this, 'refresh_post_lock' ], 10, 3 );
	}

	/**
	 * Refreshes the post lock to avoid a single user always holding the post lock.
	 *
	 * Works via the heartbeat API, where the refresh interval is 5 mins.
	 *
	 * @param array  $response   The current heartbeat response data.
	 * @param array  $data       The data received from the heartbeat request.
	 * @param string $screen_id  The current screen ID.
	 *
	 * @return array The modified heartbeat response data.
	 */
	public function refresh_post_lock( $response, $data, $screen_id ) {

		if ( empty( $data['wp-refresh-metabox-loader-nonces'] ) ) {
			return $response;
		}

		$received = $data['wp-refresh-metabox-loader-nonces'];
		$post_id  = (int) $received['post_id'];


		if ( ! $post_id ) {
			return $response;
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return $response;
		}

		$post_lock = get_post_meta( $post_id, '_edit_lock', true );

		if ( false !== $post_lock ) {
			$post_lock_elements = explode( ':', $post_lock );
			$user = $post_lock_elements[1];
			$timestamp = $post_lock_elements[0];

			if ( $user == get_current_user_id() ) {
				return $response;
			}

			// Reset the post lock to the first current user.
			wp_set_post_lock( $post_id );
			$response['lock-update'] = true;

		}

		return $response;

	}
}
