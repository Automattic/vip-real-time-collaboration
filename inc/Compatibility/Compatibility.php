<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\Compatibility;

defined( 'ABSPATH' ) || exit();

/**
 * Inspects and adjusts the environment to ensure the plugin can load.
 */
final class Compatibility {
	public function __construct() {
		add_filter( 'option_gutenberg-experiments', [ $this, 'disable_sync_collaboration_experiment' ], 10, 1 );
	}

	public static function admin_notices(): void {
		if ( ! self::is_gutenberg_plugin_active() ) {
			wp_admin_notice(
				__(
					'The Gutenberg plugin has not been installed. The VIP Realtime Collaboration plugin has been disabled.',
					'vip_realtime_collaboration'
				),
				[ 'type' => 'error' ]
			);
		}

		if ( ! self::is_websocket_url_defined() ) {
			wp_admin_notice(
				__(
					'The WebSocket URL has not been configured. The VIP Realtime Collaboration plugin has been disabled.',
					'vip_realtime_collaboration'
				),
				[ 'type' => 'error' ]
			);
		}
	}

	/**
	 * Registers the necessary filters for the plugin.
	 *
	 * @psalm-suppress PossiblyUnusedReturnValue Psalm does not detect usage via add_filter.
	 */
	public function disable_sync_collaboration_experiment( array|false $experiments ): array|false {
		if ( ! is_array( $experiments ) ) {
			return $experiments;
		}

		/* 
		 * Sync collaboration experiment is enabled via 
		 * https://github.a8c.com/Automattic/vip-realtime-collaboration/blob/8573048cbd0a8bc43784e7cee81b48b6644bd28d/inc/Assets/assets.php#L21 
		 * so this removes the core option setting from Gutenberg.
		 */
		// TODO: Implement our own experiment.
		if ( isset( $experiments['gutenberg-sync-collaboration'] ) && $experiments['gutenberg-sync-collaboration'] ) {
			unset( $experiments['gutenberg-sync-collaboration'] );
		}

		return $experiments;
	}

	/**
	 * Check if the Gutenberg plugin is active.
	 *
	 * TODO: Check GUTENBERG_VERSION in production to ensure it is running a
	 * compatible version.
	 */
	private static function is_gutenberg_plugin_active(): bool {
		return defined( 'IS_GUTENBERG_PLUGIN' ) && constant( 'IS_GUTENBERG_PLUGIN' );
	}

	/**
	 * Check if the WebSocket URL has been defined.
	 *
	 * @return bool True if the WebSocket URL is defined, false otherwise.
	 */
	private static function is_websocket_url_defined(): bool {
		return defined( 'VIP_RTC_WS_URL' ) && ! empty( constant( 'VIP_RTC_WS_URL' ) );
	}

	/**
	 * Determine if the plugin should load by inspecting the environment.
	 */
	public static function should_plugin_load(): bool {
		// Always add admin notices to communicate issues to the user.
		add_action( 'admin_notices', [ __CLASS__, 'admin_notices' ], 10, 0 );

		return self::is_gutenberg_plugin_active() && self::is_websocket_url_defined();
	}
}
