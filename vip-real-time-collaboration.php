<?php declare(strict_types = 1);

/**
 * Plugin Name: VIP Real-Time Collaboration
 * Description: A real-time collaboration plugin made by VIP for enhancing the Block Editor experience.
 * Author: WPVIP
 * Author URI: https://wpvip.com
 * Text Domain: vip-real-time-collaboration
 * Version: 0.1.3
 * Requires at least: 6.7
 * Requires PHP: 8.2
 */

namespace VIPRealTimeCollaboration;

use VIPRealTimeCollaboration\Api\RestApi;
use VIPRealTimeCollaboration\Assets\Assets;
use VIPRealTimeCollaboration\Auth\SyncPermissions;
use VIPRealTimeCollaboration\Compatibility\Compatibility;
use VIPRealTimeCollaboration\Editor\CrdtPersistence;
use VIPRealTimeCollaboration\Overrides\Overrides;

defined( 'ABSPATH' ) || exit();

// Check if the plugin is already loaded, if so, return early to prevent duplicate plugin instances.
if ( defined( 'VIP_REAL_TIME_COLLABORATION__LOADED' ) ) {
	return;
}

define( 'VIP_REAL_TIME_COLLABORATION__LOADED', true );

/** @psalm-suppress PossiblyFalseArgument */
if ( version_compare( phpversion(), '8.2', '<' ) ) {
	add_action( 'admin_notices', function (): void {
		wp_admin_notice(
			__(
				'The VIP Real-Time Collaboration plugin requires PHP 8.2+. The VIP Real-Time Collaboration plugin has been disabled.',
				'vip_real_time_collaboration'
			),
			[ 'type' => 'error' ]
		);
	}, 10, 0 );
	return;
}

/** @psalm-suppress InvalidGlobal */
global $wp_version;
/** @psalm-suppress MixedArgument */
if ( version_compare( $wp_version, '6.7', '<' ) ) {
	add_action( 'admin_notices', function (): void {
		wp_admin_notice(
			__(
				'The VIP Real-Time Collaboration plugin requires WordPress 6.7+. The VIP Real-Time Collaboration plugin has been disabled.',
				'vip_real_time_collaboration'
			),
			[ 'type' => 'error' ]
		);
	}, 10, 0 );
	return;
}

define( 'VIP_REAL_TIME_COLLABORATION__PLUGIN_ROOT', __FILE__ );
define( 'VIP_REAL_TIME_COLLABORATION__PLUGIN_DIRECTORY', untrailingslashit( plugin_dir_path( __FILE__ ) ) );
define( 'VIP_REAL_TIME_COLLABORATION__PLUGIN_VERSION', '0.1.3' );

// Autoloader
require_once __DIR__ . '/vendor/autoload.php';

// Telemetry
Telemetry\Telemetry::init( __FILE__ );

// Examples (must be manually built):
// require_once __DIR__ . '/examples/local-updates-block/local-updates-block.php';
// require_once __DIR__ . '/examples/post-meta-block/post-meta-block.php';

add_action( 'plugins_loaded', static function (): void {
	// If the plugin cannot load, return early.
	if ( ! Compatibility::should_plugin_load() ) {
		return;
	}

	// Initialize permission system
	SyncPermissions::init();

	new Assets();
	new Compatibility();
	new CrdtPersistence();
	new Overrides();
	new RestApi();

	// Fire action to indicate that the plugin has loaded.
	do_action( 'vip_real_time_collaboration_loaded' );
}, 10, 0 );
