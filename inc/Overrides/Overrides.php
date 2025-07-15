<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\Overrides;

defined( 'ABSPATH' ) || exit();

use function add_action;
use function add_filter;
use function remove_filter;
use function wp_enqueue_script;
use function plugins_url;
use function wp_insert_post;
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

		// Force the removal of refreshing the post lock, runs on admin_init as that is after the filter is set.
		add_action( 'admin_init', [ $this, 'remove_heartbeat_post_lock' ] );

		add_action( 'wp_delete_post_revision', [ $this, 'maybe_save_deleted_autosave' ], 10, 2 );
	}

	/**
	 * Remove the heartbeat post lock functionality.
	 */
	public function remove_heartbeat_post_lock(): void {
		remove_filter( 'heartbeat_received', 'wp_refresh_post_lock' );

		// Let's add a notice to the editor that the post lock functionality is off.
		add_action( 'enqueue_block_editor_assets', [ $this, 'enqueue_post_lock_notice' ] );
	}

	/**
	 * Enqueue the post lock notice script.
	 */
	public function enqueue_post_lock_notice(): void {
		wp_enqueue_script(
			'vip-realtime-collaboration-post-lock-notice',
			plugins_url( 'inc/Overrides/js/post-lock-override.js', constant( 'VIP_REALTIME_COLLABORATION__PLUGIN_ROOT' ) ),
			[ 'wp-blocks', 'wp-i18n', 'wp-element', 'wp-components' ],
			VIP_REALTIME_COLLABORATION__PLUGIN_VERSION,
			[ 'in_footer' => true ]
		);
	}

	/**
	 * Since autosaves are automatically overwritten, we attempt to save a deleted
	 * autosave as an autosave-revision as an attempt to protect against data loss
	 * by saving a copy of the previous auto-save before it gets overwritten.
	 * @psalm-suppress UnusedParam
	 */
	public function maybe_save_deleted_autosave( int $revision_id, WP_Post $revision_data ): void {
		// Make sure post_type is a revision.
		if ( 'revision' !== $revision_data->post_type ) {
			return;
		}

		// Make sure revision is an autosave, if not, we skip saving it.
		if ( ! str_contains( $revision_data->post_title, '-autosave-v1' ) ) {
			return;
		}

		// Change the post type to autosave-revision and add the post date to the title.
		$revision_data->post_type = 'autosave-revision';
		$revision_data->post_title .= '-' . $revision_data->post_date;
		// Reset the post date and modified date, so we can accurately record creation.

		// Convert the post data to an array for insertion.
		$insert_data = get_object_vars( $revision_data );
		unset( $insert_data['ID'] );
		unset( $insert_data['post_modified'] );
		unset( $insert_data['post_modified_gmt'] );
		unset( $insert_data['comment_count'] );
		unset( $insert_data['filter'] );

		wp_insert_post( $insert_data, true );
	}
}
