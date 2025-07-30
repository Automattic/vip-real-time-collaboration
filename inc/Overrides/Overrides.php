<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\Overrides;

defined( 'ABSPATH' ) || exit();

use function add_action;
use function add_filter;
use function remove_filter;
use function wp_enqueue_script;
use function plugins_url;

/**
 * Class to handle overrides for the Block Editor functionality.
 *
 * This class disables the post lock functionality in the Block Editor,
 * allowing multiple users to edit the same post simultaneously.
 */
final class Overrides {
	/**
	 * Constructor to initialize the overrides.
	 *
	 * Mode 1: Full collaboration mode. (default)
	 * Mode 2: Non-collaborative mode with standard takeover. (page_row_actions,post_row_actions)
	 * Mode 3: View-only mode - probably more difficult!
	 *
	 */
	public function __construct() {
		add_action( 'admin_init', [ $this, 'admin_init' ], 10, 0 );

		// Add a link to the non-collaborative mode in the post and page row actions.
		add_filter( 'page_row_actions', [ $this, 'enable_non_collaborative_mode_link' ], 10, 2 );
		add_filter( 'post_row_actions', [ $this, 'enable_non_collaborative_mode_link' ], 10, 2 );
	}

	/**
	 * Initialize the overrides for the admin area.
	 *
	 * This method sets up the necessary filters and actions to disable post locking
	 * and enable collaborative editing features. Should run on `admin_init` to ensure it is after the filters are set.
	 */
	public function admin_init(): void {

		if ( has_action( 'admin_action_enable_non_collaborative_mode' ) ) {
			$this->non_collaborative_mode();
		} else {
			// Default to collaborative editing mode.
			$this->collaborative_editing_mode();
		}
	}

	private function non_collaborative_mode(): void {
		// Remove the Sync Collaboration experiment script when in non-collaborative mode.
		remove_action( 'admin_init', '\\VIPRealtimeCollaboration\\Assets\\enqueue_gutenberg_experiment' );
	}

	private function collaborative_editing_mode(): void {
		// Force the removal of refreshing the post lock, runs on admin_init as that is after the filter is set.
		remove_filter( 'heartbeat_received', 'wp_refresh_post_lock' );

		// Let's add a notice to the editor that the post lock functionality is off.
		add_action( 'enqueue_block_editor_assets', [ $this, 'enqueue_post_lock_notice' ] );

		// Allow multiple users to see the edit post screen. There is a bug with this however, when autosave kicks in, see: https://core.trac.wordpress.org/ticket/63598.
		add_filter( 'show_post_locked_dialog', '__return_false' );
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

	public function enable_non_collaborative_mode_link( array $actions, \WP_Post $post ): array {
		// Add a link to enable non-collaborative mode.
		if ( current_user_can( 'edit_post', $post->ID ) && 'trash' !== $post->post_status ) {
			$actions['enable_non_collaborative_mode'] = sprintf(
				'<a href="%s">%s</a>',
				esc_url(
					add_query_arg(
						[
							'enable_non_collaborative_mode' => 1,
							'post' => $post->ID,
						],
						admin_url( 'edit.php' )
					)
				),
				__( 'Private Edit', 'vip-realtime-collaboration' )
			);
		}

		return $actions;
	}
}
