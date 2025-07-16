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

// If the plugin cannot load, return early.
if ( ! check_if_plugin_can_load() ) {
	return;
}

define( 'VIP_REALTIME_COLLABORATION__LOADED', true );
define( 'VIP_REALTIME_COLLABORATION__PLUGIN_ROOT', __FILE__ );
define( 'VIP_REALTIME_COLLABORATION__PLUGIN_DIRECTORY', untrailingslashit( plugin_dir_path( __FILE__ ) ) );
define( 'VIP_REALTIME_COLLABORATION__PLUGIN_VERSION', '0.1.0' );

// Autoloader
require_once __DIR__ . '/vendor/autoload.php';

// Plugin filters and hooks
new Hooks\Hooks();

// Plugin components
new Assets\Assets();

// Core overrides.
new Overrides\Overrides();

// Fire action to indicate that the plugin is loaded
do_action( 'vip_realtime_collaboration_loaded' );

/**
 * Check if the plugin can load, by ensuring that:
 *
 * - The Gutenberg Plugin has been installed, and is active.
 * - The WebSocket URL has been defined.
 *
 * @return bool True if the plugin can load, false otherwise.
 */
function check_if_plugin_can_load(): bool {
	// Do not load the plugin if Gutenberg is not installed or activated.
	// We are checking the Gutenberg experiments function as we depend on it for the sync feature.
	if ( ! defined( 'IS_GUTENBERG_PLUGIN' ) || ! \IS_GUTENBERG_PLUGIN ) {
		add_action( 'admin_notices', function (): void {
			wp_admin_notice(
				__(
					'The Gutenberg plugin has not been installed. The VIP Realtime Collaboration plugin has been disabled.',
					'vip_realtime_collaboration'
				),
				[ 'type' => 'error' ]
			);
		}, 10, 0 );

		// Prevent the plugin from loading.
		return false;
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
		return false;
	}

	return true;
}
