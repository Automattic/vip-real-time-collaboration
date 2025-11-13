/**
 * WordPress dependencies
 */
import { useBlockEditingMode } from '@wordpress/block-editor';
import { createHigherOrderComponent } from '@wordpress/compose';
import { addFilter } from '@wordpress/hooks';

export function setupViewOnlyBlocks() {
	const viewOnlyBlocks = createHigherOrderComponent( BlockEdit => {
		return props => {
			useBlockEditingMode( 'disabled' );

			return <BlockEdit { ...props } />;
		};
	}, 'withDisabledBlocks' );

	addFilter( 'editor.BlockEdit', 'vip-rtc-view-only-blocks', viewOnlyBlocks );
}
