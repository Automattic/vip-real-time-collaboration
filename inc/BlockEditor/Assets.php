<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\BlockEditor;

defined( 'ABSPATH' ) || exit();

class Assets {
	/**
	 * Initializes the assets for the Block Editor.
	 */
	public static function init(): void {
		add_action( 'enqueue_block_editor_assets', [ self::class, 'enqueueAssets' ] );
	}

	/**
	 * Enqueues the necessary assets for the Block Editor.
	 */
	public static function enqueueAssets(): void {
		$asset_file = VIP_REALTIME_COLLABORATION__PLUGIN_DIRECTORY . '/build/index.asset.php';

		$asset = include $asset_file;

		wp_enqueue_script(
			'vip-realtime-collaboration-editor',
			plugins_url( 'build/index.js', VIP_REALTIME_COLLABORATION__PLUGIN_ROOT ),
			$asset['dependencies'],
			$asset['version'],
			[
				'in_footer' => true,
			]
		);
	}
}
