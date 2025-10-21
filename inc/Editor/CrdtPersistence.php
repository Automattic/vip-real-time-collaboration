<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Editor;

use WP_Block_Editor_Context;

use VIPRealTimeCollaboration\Compatibility\Compatibility;
use function add_action;
use function register_meta;

defined( 'ABSPATH' ) || exit();

/**
 * Handles the persistence of CRDT documents for supported sync objects. For
 * now, this is limited to posts.
 */
final class CrdtPersistence {
	const POST_META_KEY = '_vip_rtc_state';

	public function __construct() {
		add_action( 'init', [ $this, 'register_meta' ], 999, 0 );
		add_filter( 'block_editor_settings_all', [ $this, 'disable_code_editor' ], 10, 2 );
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
					// IMPORTANT: Revisions must be disabled because we always want to
					// preserve the latest persisted CRDT document, even when a revision
					// is restored. This ensures that we can continue to apply updates to
					// a shared document and peers can simply merge the restored revision
					// like any other incoming update.
					//
					// If we want to persist CRDT documents alongisde revisions in the
					// future, we should do so in a separate meta key.
					'revisions_enabled' => false,
					'show_in_rest' => true,
					'single' => true,
					'type' => 'string',
				]
			);
		}
	}

	/**
	 * Disable the code editor.
	 *
	 * @psalm-suppress PossiblyUnusedReturnValue Psalm does not detect usage via add_filter.
	 */
	public function disable_code_editor( array $settings, WP_Block_Editor_Context $context ): array {
		// Only modify settings for the post editor context.
		if ( ! $context->name || ! $context->post || 'core/edit-post' !== $context->name ) {
			return $settings;
		}

		// Get the post, and supported post types for collaboration from the arguments provided.
		$supported_post_types = Compatibility::get_supported_post_types();
		$post = $context->post;

		// If the post doesn't support collaboration, return the original settings.
		if ( ! in_array( $post->post_type, $supported_post_types, true ) ) {
			return $settings;
		}

		// Disable switching to code editing mode.
		$settings['codeEditingEnabled'] = false;

		// Return the modified settings.
		return $settings;
	}
}
