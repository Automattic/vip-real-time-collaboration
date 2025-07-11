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

// Check if the plugin is already loaded, if so, return early to prevent duplicate plugin instances.
if ( defined( 'VIP_REALTIME_COLLABORATION__LOADED' ) ) {
	return;
}

// Avoids setting the Sync flag twice.
add_filter( 'pre_option_gutenberg-experiments', function ( array $experiments ): array {
		// Remove the default sync experiment for Gutenberg to allow us to control it here.
		unset( $experiments['gutenberg-sync-collaboration'] );
		return $experiments;
} );

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

// Run on admin_init early so that we can selectively turn on functionality.
add_action( 'admin_init', function(): void {

	if ( should_exit_collaborative_editing() ) {
		return;
	}

	// Plugin components
	new Assets\Assets();

	// Core overrides.
	new Overrides\Overrides();
}, 9 );

// Fire action to indicate that the plugin is loaded
do_action( 'vip_realtime_collaboration_loaded' );

/**
 * Determines whether to exit collaborative editing.
 *
 * @return bool True if collaborative editing should be exited, false otherwise.
 */
function should_exit_collaborative_editing(): bool {

	global $pagenow;
	if ( 'site-editor.php' == $pagenow ) {
		return true;
	}

	return false;
}
