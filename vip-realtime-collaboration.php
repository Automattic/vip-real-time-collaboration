<?php declare(strict_types = 1);

/**
 * Plugin Name: VIP Realtime Collaboration
 * Description: A realtime collaboration plugin made by VIP for enhancing the Block Editor experience.
 * Author: WPVIP
 * Author URI: https://wpvip.com
 * Text Domain: vip-realtime-collaboration
 * Version: 0.1.0
 * Requires at least: 6.7
 * Requires PHP: 8.2
 */

namespace VIPRealtimeCollaboration;

defined( 'ABSPATH' ) || exit();

if ( should_exit_collaborative_editing() ) {
	return;
}

// Check if the plugin is already loaded, if so, return early to prevent duplicate plugin instances.
if ( defined( 'VIP_REALTIME_COLLABORATION__LOADED' ) ) {
	return;
}

// Do not load the plugin if the WebSocket URL is not defined.
if ( ! defined( 'VIP_RTC_WS_URL' ) ) {
	add_action( 'admin_notices', function (): void {
		wp_admin_notice(
			__(
				'The WebSocket URL has not been configured. The VIP Realtime Collaboration plugin has been disabled.',
				'vip_realtime_collaboration'
			),
			[ 'type' => 'error' ]
		);
	}, 10, 0 );

	// Prevent the plugin from loading.
	return;
}

define( 'VIP_REALTIME_COLLABORATION__LOADED', true );
define( 'VIP_REALTIME_COLLABORATION__PLUGIN_ROOT', __FILE__ );
define( 'VIP_REALTIME_COLLABORATION__PLUGIN_DIRECTORY', untrailingslashit( plugin_dir_path( __FILE__ ) ) );
define( 'VIP_REALTIME_COLLABORATION__PLUGIN_VERSION', '0.1.0' );

// Autoloader
require_once __DIR__ . '/vendor/autoload.php';

// Plugin components
new Assets\Assets();

// Core overrides.
new Overrides\Overrides();

// Fire action to indicate that the plugin is loaded
do_action( 'vip_realtime_collaboration_loaded' );

/**
 * Determines whether to exit collaborative editing.
 *
 * @return bool True if collaborative editing should be exited, false otherwise.
 */
function should_exit_collaborative_editing(): bool {
	global $post_id;

	// If the post is not a block-based post, we should exit collaborative editing.
	if ( ! empty( $post_id ) && ! \WP_Block_Editor_Context::is_block_editor( $post_id ) ) {
		return true;
	}

	// Allow collaborative editing to skip based on post ID.
	if ( apply_filters( 'vip_realtime_collaboration_exit', false, $post_id ) ) {
		return true;
	}

	return false;
}
