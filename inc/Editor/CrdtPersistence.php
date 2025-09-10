<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Editor;

use VIPRealTimeCollaboration\Compatibility\Compatibility;
use function add_action;
use function post_type_supports;
use function register_meta;
use function get_post;
use function get_post_meta;

use WP_Post;
use WP_REST_Request;
use WP_REST_Response;

defined( 'ABSPATH' ) || exit();

/**
 * Handles the persistence of CRDT documents for supported sync objects. For
 * now, this is limited to posts.
 */
final class CrdtPersistence {
	const POST_META_KEY = 'vip_rtc_state';

	public function __construct() {
		add_action( 'init', [ $this, 'register_meta' ], 999, 0 );
		add_action( 'wp_restore_post_revision', [ $this, 'revision_restored' ], 10, 2 );
	}

	public function register_meta(): void {
		foreach ( Compatibility::get_supported_post_types() as $post_type ) {
			register_meta(
				'post',
				self::POST_META_KEY,
				[
					'auth_callback' => function ( bool $_allowed, string $_meta_key, int $object_id, int $user_id ): bool {
						return user_can( $user_id, 'edit_post', $object_id );
					},
					'object_subtype' => $post_type,
					'revisions_enabled' => post_type_supports( $post_type, 'revisions' ),
					'show_in_rest' => true,
					'single' => true,
					'type' => 'string',
				]
			);
		}
	}

	public function revision_restored( int $post_id, int $revision_id ): void {
		// issue an update to the post meta to trigger sync
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return;
		}

		$crdt_meta = get_post_meta( $post_id, self::POST_META_KEY, true );
		if ( is_string( $crdt_meta ) && ! empty( $crdt_meta ) ) {
			$crdt_meta_array = json_decode( $crdt_meta, true );
			if ( json_last_error() === JSON_ERROR_NONE ) {
				$crdt_meta_array['isRevision'] = true;
				$encoded_meta = json_encode( $crdt_meta_array );
				if ( $encoded_meta !== false ) {
					update_post_meta( $post_id, self::POST_META_KEY, $encoded_meta );
				}
			}
		}
	}
}
