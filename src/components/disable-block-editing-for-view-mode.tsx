/**
 * WordPress dependencies
 */
import { createHigherOrderComponent } from '@wordpress/compose';
import { addFilter } from '@wordpress/hooks';

/**
 * Internal dependencies
 */
import { useDisableBlockEditing } from '@/hooks/use-disable-block-editing';

/**
 * Sets up the view only mode by modifying the edit function of a block,
 * to disable editing entirely if view mode is enabled.
 *
 * This is only for the visual editor, not the code editor.
 */
export function disableBlockEditingForViewMode() {
	const disabledBlockEdit = createHigherOrderComponent( BlockEdit => {
		return props => {
			useDisableBlockEditing();
			return <BlockEdit { ...props } />;
		};
	}, 'disabledBlockEdit' );

	addFilter( 'editor.BlockEdit', 'vip-rtc/disable-block-editing-for-view-mode', disabledBlockEdit );
}
