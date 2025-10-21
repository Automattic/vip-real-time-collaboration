<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Editor;

use WP_Block_Editor_Context;

use VIPRealTimeCollaboration\Compatibility\Compatibility;
use function add_filter;

defined( 'ABSPATH' ) || exit();

/**
 * Handles the changes to the UI of the Block Editor for supported sync objects. For
 * now, this is limited to posts.
 */
final class EditorUI {
	public function __construct() {
		add_filter( 'block_editor_settings_all', [ $this, 'disable_code_editor' ], 10, 2 );
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

		// Disable the code editor.
		$settings['codeEditingEnabled'] = false;

		return $settings;
	}
}
