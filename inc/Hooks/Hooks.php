<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\Hooks;

defined( 'ABSPATH' ) || exit();

/**
 * Registers the necessary filters and actions for the VIP Realtime Collaboration plugin.
 */
final class Hooks {
	public function __construct() {
		// Register the Gutenberg experiments filter to control the sync feature.
		$this->register_gutenberg_experiments_filter();
	}

	/**
	 * Registers the necessary filters for the plugin.
	 */
	public function register_gutenberg_experiments_filter(): void {
		// Avoids setting the Sync flag twice, if it exists.
		add_filter( 'pre_option_gutenberg-experiments', function ( array|false $experiments ): array|false {
			// Remove the default sync experiment for Gutenberg to allow us to control it here.
			if ( isset( $experiments['gutenberg-sync-collaboration'] ) && $experiments['gutenberg-sync-collaboration'] ) {
				unset( $experiments['gutenberg-sync-collaboration'] );
			}

			// If $experiments is not an array, initialize it.
			// This is to ensure that we can safely add our own sync experiment.
			if ( ! is_array( $experiments ) ) {
				$experiments = [];
			}

			// Set our own sync experiment.
			$experiments['gutenberg-sync-collaboration'] = true;

			return $experiments;
		}, 10, 1 );
	}
}
