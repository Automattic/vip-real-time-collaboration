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
		add_action( 'enqueue_block_editor_assets', [ $this, 'enqueue_block_editor_assets' ], 10, 0 );
	}

	public function enable_gutenberg_experiment(): void {
		wp_add_inline_script( 'wp-block-editor', 'window.__experimentalEnableSync = true', 'before' );
	}

	public function load_assets(): void {
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
	}

	public function enqueue_block_editor_assets(): void {
		wp_enqueue_style( 'vip-realtime-collaboration', plugins_url( 'build/index.css', constant( 'VIP_REALTIME_COLLABORATION__PLUGIN_ROOT' ) ) );
	}
}
