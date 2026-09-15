<?php declare(strict_types = 1);

/**
 * Plugin Name: VIP RTC E2E Helpers
 * Description: Test-only helper that wp-env mounts as a must-use plugin on the tests site (see .wp-env.json). Not part of the shipped plugin.
 */

namespace VIPRealTimeCollaboration\E2E;

defined( 'ABSPATH' ) || exit();

// Refuse to run anywhere that is not a local or test environment.
if ( 'production' === wp_get_environment_type() ) {
	return;
}

const META_BOX_QUERY_ARG = 'vip_rtc_e2e_meta_box';
const META_BOX_ID = 'vip-rtc-e2e-meta-box';
const META_BOX_TITLE = 'VIP RTC E2E Meta Box';

/**
 * Register a classic meta box on demand. A meta box has to be registered inside
 * the request that renders the editor, which is why this lives in PHP while the
 * other test fixtures go through WP-CLI (see tests/e2e/utils/rtc.ts).
 *
 * Append `?vip_rtc_e2e_meta_box=incompatible` to the editor URL to register a
 * plain `add_meta_box()` call, exactly like most third-party plugins do. Use
 * `compatible` instead to flag it with `__rtc_compatible_meta_box`, which is
 * the Gutenberg opt-in that keeps real-time collaboration enabled. Use
 * `capability` to register the unflagged box only for users who pass
 * `current_user_can( 'manage_options' )`, the way plugins gate admin-only
 * boxes. Editors fail that check; a super admin passes it even with no role.
 *
 * @param string $post_type The post type being edited.
 */
function register_meta_box_on_demand( string $post_type ): void {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized, WordPress.Security.ValidatedSanitizedInput.MissingUnslash -- Test-only switch read from the editor URL; sanitized below.
	$raw_mode = wp_unslash( $_GET[ META_BOX_QUERY_ARG ] ?? '' );
	$mode = is_string( $raw_mode ) ? sanitize_key( $raw_mode ) : '';

	if ( ! in_array( $mode, [ 'compatible', 'incompatible', 'capability' ], true ) ) {
		return;
	}

	if ( 'capability' === $mode && ! current_user_can( 'manage_options' ) ) {
		return;
	}

	$callback_args = 'compatible' === $mode ? [ '__rtc_compatible_meta_box' => true ] : [];

	add_meta_box(
		META_BOX_ID,
		META_BOX_TITLE,
		__NAMESPACE__ . '\\render_meta_box',
		$post_type,
		'normal',
		'default',
		$callback_args
	);
}
add_action( 'add_meta_boxes', __NAMESPACE__ . '\\register_meta_box_on_demand', 10, 1 );

/**
 * Render the on-demand meta box.
 */
function render_meta_box(): void {
	echo '<p>Classic meta box registered by the VIP RTC E2E helpers.</p>';
}
