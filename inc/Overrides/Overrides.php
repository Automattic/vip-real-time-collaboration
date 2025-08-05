<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Overrides;

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
	 */
	public function __construct() {
		// Allow multiple users to see the edit post screen. There is a bug with this however, when autosave kicks in, see: https://core.trac.wordpress.org/ticket/63598.
		add_filter( 'show_post_locked_dialog', '__return_false' );

		// Force the removal of refreshing the post lock, runs on admin_init as that is after the filter is set.
		add_action( 'admin_init', [ $this, 'remove_heartbeat_post_lock' ] );
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
			'vip-real-time-collaboration-post-lock-notice',
			plugins_url( 'inc/Overrides/js/post-lock-override.js', constant( 'VIP_REAL_TIME_COLLABORATION__PLUGIN_ROOT' ) ),
			[ 'wp-blocks', 'wp-i18n', 'wp-element', 'wp-components' ],
			VIP_REAL_TIME_COLLABORATION__PLUGIN_VERSION,
			[ 'in_footer' => true ]
		);
	}
}
