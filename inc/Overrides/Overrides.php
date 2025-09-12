<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Overrides;

defined( 'ABSPATH' ) || exit();

use VIPRealTimeCollaboration\Compatibility\Compatibility;
use function add_action;
use function add_filter;
use function remove_filter;
use function get_post;

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

		// Force the removal of refreshing the post lock, runs on admin_init as that is after the filter is set.
		add_action( 'admin_init', [ $this, 'remove_heartbeat_post_lock' ] );

		// Ensure that the _edit_lock meta key is never returned, effectively disabling the post lock functionality.
		add_filter( 'get_post_metadata', [ $this, 'filter_post_meta' ], 10, 3 );
	}

	/**
	 * Remove the heartbeat post lock functionality.
	 */
	public function remove_heartbeat_post_lock(): void {
		remove_filter( 'heartbeat_received', 'wp_refresh_post_lock' );
	}

	/**
	 * Set the _edit_lock meta key to false, to disable post locking.
	 *
	 * @param mixed $value the current meta value.
	 * @param int   $object_id the object ID.
	 * @param string $meta_key the meta key.
	 * @return mixed the filtered meta value.
	 */
	public function filter_post_meta( mixed $value, int $object_id, string $meta_key ): mixed {
		// get the post using the object_id
		$post = get_post( $object_id );

		// Ensure that the post is a valid WP_Post object, and it exists.
		if ( ! $post instanceof \WP_Post ) {
			return $value;
		}

		// Ensure collaboration is enabled for this post type.
		$supported_post_types = Compatibility::get_supported_post_types();
		if ( ! in_array( $post->post_type, $supported_post_types, true ) ) {
			return $value;
		}

		// If the meta key is _edit_lock, return false to disable the lock.
		if ( '_edit_lock' === $meta_key ) {
			return false;
		}

		// For all other meta keys, return the original value.
		return $value;
	}
}
