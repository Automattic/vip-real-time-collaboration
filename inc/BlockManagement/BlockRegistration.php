<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\BlockManagement;

defined( 'ABSPATH' ) || exit();

use function register_block_type;

class BlockRegistration {

	public static function init(): void {
		add_action( 'init', [ __CLASS__, 'register_blocks' ], 10, 0 );
	}

	public static function register_blocks(): void {
		register_block_type( VIP_REALTIME_COLLABORATION__PLUGIN_DIRECTORY . '/build/blocks/realtime-collaboration-block' );
	}
}
