<?php declare(strict_types = 1);

/**
 * Plugin Name:       SCF Simple Text Block
 * Description:       A Secure Custom Fields simple text block
 * Version:           1.0.0
 * Requires at least: 6.8
 * Requires PHP:      7.4
 * Author:            WordPress VIP
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       example-scf-block
 */

use function acf_register_block_type;
use function add_action;
use function get_field;
use function __;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

add_action( 'acf/init', function (): void {
	if ( ! function_exists( 'acf_register_block_type' ) ) {
		return;
	}

	acf_register_block_type( array(
		'api_version' => 3,
		'name' => 'simple-text-block',
		'title' => __( 'Simple Text Block', 'your-textdomain' ),
		'icon' => 'editor-paragraph',
		'description' => __( 'A block with a single text field.', 'your-textdomain' ),
		'render_callback' => 'my_simple_text_block_render',
	) );
} );

function my_simple_text_block_render() {
	$text = get_field( 'simple_text' ); // field name from ACF field group

	echo '<div class="simple-text-block">';
	echo esc_html( $text );
	echo '</div>';
}
