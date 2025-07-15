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

// Do not load the plugin if Gutenberg is not installed or activated.
// We are checking the Gutenberg experiments function as we depend on it for the sync feature.
if ( ! function_exists( 'the_gutenberg_experiments' ) ) {
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

// Avoids setting the Sync flag twice, if it exists.
add_filter( 'pre_option_gutenberg-experiments', function ( array|false $experiments ): array|false {
	// Remove the default sync experiment for Gutenberg to allow us to control it here.
	if ( isset( $experiments['gutenberg-sync-collaboration'] ) && $experiments['gutenberg-sync-collaboration'] ) {
		unset( $experiments['gutenberg-sync-collaboration'] );
	}
	return $experiments;
} );

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
