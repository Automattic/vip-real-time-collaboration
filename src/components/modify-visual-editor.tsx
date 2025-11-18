/**
 * WordPress dependencies
 */
import { createHigherOrderComponent } from '@wordpress/compose';
import { addFilter } from '@wordpress/hooks';

/**
 * Internal dependencies
 */
import { useModifyVisualEditor } from '@/hooks/use-modify-visual-editor';

/**
 * Sets up the view only mode by modifying the edit function of a block,
 * to disable editing entirely if view mode is enabled.
 *
 * This is only for the visual editor, not the code editor.
 */
export function modifyVisualEditor() {
	const viewOnlyMode = createHigherOrderComponent( BlockEdit => {
		return props => {
			useModifyVisualEditor();
			return <BlockEdit { ...props } />;
		};
	}, 'modifyVisualEditor' );

	addFilter( 'editor.BlockEdit', 'vip-rtc/modify-visual-editor', viewOnlyMode );
}
