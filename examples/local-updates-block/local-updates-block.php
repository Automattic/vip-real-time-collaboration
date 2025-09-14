<?php declare(strict_types = 1);

/**
 * Plugin Name:       Wikipedia Edits Block
 * Description:       A block that allows syncing of external state via a timestamp attribute.
 * Version:           1.0.0
 * Requires at least: 6.8
 * Requires PHP:      7.4
 * Author:            WordPress VIP
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       example-wikipedia-edits
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

function register_example_wikipedia_edits_block(): void {
	// Register the block using the metadata loaded from the block manifest.
	wp_register_block_types_from_metadata_collection( __DIR__ . '/build', __DIR__ . '/build/blocks-manifest.php' );
}
add_action( 'init', 'register_example_wikipedia_edits_block' );
