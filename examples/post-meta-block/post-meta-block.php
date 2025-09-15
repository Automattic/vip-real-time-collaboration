<?php declare(strict_types = 1);

/**
 * Plugin Name:       Subtitle Block
 * Description:       A "post meta block" that opts-in to post meta syncing.
 * Version:           1.0.0
 * Requires at least: 6.8
 * Requires PHP:      7.4
 * Author:            WordPress VIP
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       example-subtitle
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

function register_example_subtitle_block(): void {
	// Register the post meta field to be used in the block. The meta key must
	// match the meta key used in `edit.js`.
	register_post_meta( 'post', 'example_subtitle', [
		'show_in_rest' => true, // required for syncing
		'single' => true,
		'type' => 'string',
	] );

	// Register the block using the metadata loaded from the block manifest.
	wp_register_block_types_from_metadata_collection( __DIR__ . '/build', __DIR__ . '/build/blocks-manifest.php' );
}
add_action( 'init', 'register_example_subtitle_block' );
