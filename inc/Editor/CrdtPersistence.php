<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Editor;

use VIPRealTimeCollaboration\Compatibility\Compatibility;
use function add_action;
use function post_type_supports;
use function register_meta;

defined( 'ABSPATH' ) || exit();

/**
 * Handles the persistence of CRDT documents for supported sync objects. For
 * now, this is limited to posts.
 */
final class CrdtPersistence {
	const CRDT_DOC_VERSION = 1;
	const POST_META_KEY = 'vip_rtc_state';

	public function __construct() {
		add_action( 'init', [ $this, 'register_meta' ], 999, 0 );
	}

	public function register_meta(): void {
		foreach ( Compatibility::get_supported_post_types() as $post_type ) {
			register_meta(
				'post',
				self::POST_META_KEY,
				[
					'auth_callback' => '__return_true',
					'object_subtype' => $post_type,
					'revisions_enabled' => post_type_supports( $post_type, 'revisions' ),
					'show_in_rest' => true,
					'single' => true,
					'type' => 'string',
				]
			);
		}
	}
}
