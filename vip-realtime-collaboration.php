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

define( 'VIP_REALTIME_COLLABORATION__LOADED', true );
define( 'VIP_REALTIME_COLLABORATION__PLUGIN_ROOT', __FILE__ );
define( 'VIP_REALTIME_COLLABORATION__PLUGIN_DIRECTORY', untrailingslashit( plugin_dir_path( __FILE__ ) ) );
define( 'VIP_REALTIME_COLLABORATION__PLUGIN_VERSION', '0.1.0' );

// Autoloader
require_once __DIR__ . '/vendor/autoload.php';

// Plugin components
new Assets\Assets();

// Fire action to indicate that the plugin is loaded
do_action( 'vip_realtime_collaboration_loaded' );
