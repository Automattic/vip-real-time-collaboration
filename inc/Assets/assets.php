<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\Assets;

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
		wp_add_inline_script( 'wp-block-editor', 'window.__experimentalEnableSync = true', 'before' );
	}

	public function load_assets(): void {
		// Use the VIP_RTC_WS_URL constant if defined, otherwise default to localhost.
		// This allows for easy configuration in different environments.
		$vip_rtc_ws_url = defined( 'RTC_WS_URL' ) ? RTC_WS_URL : 'ws://localhost:1234';

		error_log( sprintf( 'VIP RTC WebSocket URL: %s', RTC_WS_URL ) );

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

		wp_localize_script('vip-realtime-collaboration', 'VIP_RTC', [
			'wsUrl'           => $vip_rtc_ws_url,
		]);
	}
}
