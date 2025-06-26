<?php declare(strict_types = 1);

/**
 * @see https://github.com/WordPress/gutenberg/blob/trunk/docs/reference-guides/block-api/block-metadata.md#render
 */
?>
<p <?php echo get_block_wrapper_attributes(); ?>>
	<?php esc_html_e( 'Realtime Collaboration – hello from a dynamic block!', 'realtime-collaboration-block' ); ?>
</p>
