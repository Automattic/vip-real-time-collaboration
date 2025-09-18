<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Overrides;

defined( 'ABSPATH' ) || exit();

use VIPRealTimeCollaboration\Compatibility\Compatibility;
use function add_filter;

use WP_Post;

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

		// Ensure that the _edit_lock meta key is never returned, effectively disabling the post lock functionality just for revisions.php.
		add_filter( 'get_post_metadata', [ $this, 'filter_post_meta' ], 10, 3 );
	}

	/**
	 * Set the _edit_lock meta key to false, to disable post locking on revisions.php only.
	 *
	 * @param mixed $value the current meta value.
	 * @param int   $object_id the object ID.
	 * @param string $meta_key the meta key.
	 * @return mixed the filtered meta value.
	 * @psalm-suppress PossiblyUnusedReturnValue
	 */
	public function filter_post_meta( mixed $value, int $object_id, string $meta_key ): mixed {
		global $post, $pagenow;

		// Skip if not on the revisions.php page, or the meta_key is not _edit_lock.
		if ( 'revision.php' !== $pagenow || '_edit_lock' !== $meta_key ) {
			return $value;
		}

		$supported_post_types = Compatibility::get_supported_post_types();

		// If there is a post and it matches the object ID and is a supported post type, return false to disable the lock.
		/** @var WP_Post|null $post */
		if ( $post && $post->ID === $object_id && in_array( $post->post_type, $supported_post_types, true ) ) {
			return false;
		}

		// Otherwise, return the original value.
		return $value;
	}
}
