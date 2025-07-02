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

// Do not load the plugin if the WebSocket URL is not defined.
// This is a critical configuration for the plugin to function correctly.
if ( ! defined( 'VIP_RTC_WS_URL' ) ) {
	// ToDo: Using wp_admin_notices causes a header already sent warning to show up. Ideally, we should be using that instead and we don't need an anonymous function.
	add_action( 'admin_notices', function (): void {
		?>
			<div class="notice notice-error">
				<p><?php esc_html_e( 'VIP Realtime Collaboration WebSocket URL has not been configured. The plugin will not be functional without it.', 'vip_realtime_collaboration' ); ?></p>
			</div>
				<?php
	}, 10, 0 );
	return;
}

define( 'VIP_REALTIME_COLLABORATION__PLUGIN_ROOT', __FILE__ );
define( 'VIP_REALTIME_COLLABORATION__PLUGIN_DIRECTORY', untrailingslashit( plugin_dir_path( __FILE__ ) ) );
define( 'VIP_REALTIME_COLLABORATION__PLUGIN_VERSION', '0.1.0' );

// Autoloader
require_once __DIR__ . '/vendor/autoload.php';

// Plugin components
new Assets\Assets();

// Fire action to indicate that the plugin is loaded
do_action( 'vip_realtime_collaboration_loaded' );
