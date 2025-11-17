/**
 * WordPress dependencies
 */
import { createHigherOrderComponent } from '@wordpress/compose';
import { addFilter } from '@wordpress/hooks';

/**
 * Internal dependencies
 */
import { useViewOnlyBlocks } from '@/hooks/use-view-only-blocks';

/**
 * Sets up the view only mode by modifying the edit function of a block,
 * to disable editing entirely if view mode is enabled.
 */
export function setupViewOnlyMode() {
	const viewOnlyMode = createHigherOrderComponent( BlockEdit => {
		return props => {
			useViewOnlyBlocks();
			return <BlockEdit { ...props } />;
		};
	}, 'viewOnlyMode' );

	addFilter( 'editor.BlockEdit', 'vip-rtc/view-only-mode', viewOnlyMode );
}
