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

	protected $autosave_post_type = 'autosave-revision';

	/**
	 * Constructor to initialize the overrides.
	 */
	public function __construct() {
		// Allow multiple users to see the edit post screen. There is a bug with this however, when autosave kicks in, see: https://core.trac.wordpress.org/ticket/63598.
		add_filter( 'show_post_locked_dialog', '__return_false' );

		// Force the removal of refreshing the post lock, runs on admin_init as that is after the filter is set.
		add_action( 'admin_init', [ $this, 'remove_heartbeat_post_lock' ] );

		add_action( 'wp_delete_post_revision', [ $this, 'maybe_save_deleted_autosave' ], 10, 2 );

		add_action( 'init', [ $this, 'add_autosave_cron' ] );
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
	 */
	public function maybe_save_deleted_autosave( int $_revision_id, WP_Post $revision_data ): void {
		// Make sure post_type is a revision.
		if ( 'revision' !== $revision_data->post_type ) {
			return;
		}

		// Make sure revision is an autosave, if not, we skip saving it.
		if ( ! str_contains( $revision_data->post_title, '-autosave-v1' ) ) {
			return;
		}

		// Change the post type to autosave-revision and add the post date to the title.
		$revision_data->post_type = $this->autosave_post_type;
		$revision_data->post_title .= '-' . $revision_data->post_date;

		/**
		 * Convert the post data to an array for insertion.
		 *
		 * @var array{
		 *   ID: int,
		 *   comment_count?: int,
		 *   filter?: string,
		 *   post_content?: string,
		 *   post_modified?: string,
		 *   post_modified_gmt?: string,
		 * }
		 */
		$insert_data = get_object_vars( $revision_data );

		// Reset the ID, post date, and modified date, so we can accurately record creation.
		unset( $insert_data['ID'] );
		unset( $insert_data['post_modified'] );
		unset( $insert_data['post_modified_gmt'] );
		unset( $insert_data['comment_count'] );
		unset( $insert_data['filter'] );

		wp_insert_post( $insert_data );
	}

	/**
	 * Schedule a daily cron job to clean up old autosaves.
	 *
	 * This will run once a day to delete autosaves older than the specified number of days.
	 */
	public function add_autosave_cron(): void {
		if ( ! wp_next_scheduled( 'vip_realtime_collaboration_autosave_cron' ) ) {
			wp_schedule_event( time(), 'daily', 'vip_realtime_collaboration_autosave_cron' );
		}

		add_action( 'vip_realtime_collaboration_autosave_cron', [ $this, 'handle_autosave_cron' ] );
	}

	/**
	 * Handle the autosave cleanup cron job.
	 * Hard-coded limit of 30 days maximum time for autosaves to be kept.
	 */
	public function handle_autosave_cron(): void {
		/* Remove autosaves older than a specified number of days.
		 * This is to prevent the database from being cluttered with old autosaves.
		 * The number of days to keep autosaves can be filtered using 'autosave-revision-days-to-keep'.
		 */
		$days_to_keep = apply_filters( 'autosave_revision_days_to_keep', 7 ); // Number of days to keep autosaves.

		if ( $days_to_keep >= 30 ) {
			$days_to_keep = 30; // Limit to a maximum of 30 days.
		}

		// Add limitless query to get all autosaves older than the specified number of days, but only grab IDs.
		$posts_to_delete = get_posts( [
			'post_type' => $this->autosave_post_type,
			'posts_per_page' => -1,
			'date_query' => [
				'before' => gmdate( 'Y-m-d H:i:s', strtotime( "-{$days_to_keep} days" ) ),
			],
			'fields' => 'ids', // Only get post IDs for deletion.
		] );

		foreach ( $posts_to_delete as $autosave ) {
			wp_delete_post( $autosave, true ); // Force delete the autosaves.
		}
	}
}
