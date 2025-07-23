<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\Assets;

defined( 'ABSPATH' ) || exit();

use function add_action;
use function plugins_url;
use function wp_add_inline_script;
use function wp_die;
use function wp_enqueue_script;

/**
 * Enqueues the necessary JavaScript and CSS assets for the plugin.
 */
final class Assets {
	public function __construct() {
		add_action( 'admin_init', [ $this, 'enable_gutenberg_experiment' ], 10, 0 );
		add_action( 'admin_init', [ $this, 'load_assets' ], 10, 0 );
	}

	public function enable_gutenberg_experiment(): void {
		// This enables RTC, there is an override here: https://github.a8c.com/Automattic/vip-realtime-collaboration/blob/fix/sync-collaboration-setting/inc/Compatibility/Compatibility.php#L47-L55 also, make sure one exists.
		wp_add_inline_script( 'wp-block-editor', 'window.__experimentalEnableSync = true', 'before' );
	}

	public function load_assets(): void {
		$vip_rtc_ws_url = null;

		// Error checking for the WebSocket URL is already done in the main plugin file.
		// This is here just for safety.
		if ( defined( 'VIP_RTC_WS_URL' ) ) {
			$vip_rtc_ws_url = (string) constant( 'VIP_RTC_WS_URL' );
		}

		$asset_file = dirname( constant( 'VIP_REALTIME_COLLABORATION__PLUGIN_ROOT' ) ) . '/build/index.asset.php';
		$script_file = plugins_url( 'build/index.js', constant( 'VIP_REALTIME_COLLABORATION__PLUGIN_ROOT' ) );

		if ( ! file_exists( $asset_file ) ) {
			wp_die( sprintf( 'The asset file %s is missing. Run `npm run build` to generate it.', esc_html( $asset_file ) ) );
		}

		/**
		 * @psalm-var array{
		 *   dependencies: array{string},
		 *   version: string,
		 * }
		 */
		$asset = include $asset_file;

		wp_enqueue_script(
			'vip-realtime-collaboration',
			$script_file,
			$asset['dependencies'],
			$asset['version'],
			[ 'in_footer' => false ]
		);

		$vip_rtc_encoded = wp_json_encode( [ 'wsUrl' => $vip_rtc_ws_url ] );
		/** @psalm-suppress DocblockTypeContradiction */ // wp_json_encode() can return an empty string.
		if ( ! is_string( $vip_rtc_encoded ) || '' === $vip_rtc_encoded ) {
			$vip_rtc_encoded = '{}';
		}

		wp_add_inline_script(
			'vip-realtime-collaboration',
			"var VIP_RTC = $vip_rtc_encoded;",
			'before'
		);
	}
}
