/**
 * External dependencies
 */
import { useBlockProps } from '@wordpress/block-editor';
import { TextControl } from '@wordpress/components';
import { useEntityProp } from '@wordpress/core-data';
import { useSelect } from '@wordpress/data';
import { __ } from '@wordpress/i18n';

/**
 * A "post meta block" that allows the user to provide a subtitle for the post.
 * The result is persisted as post meta.
 *
 * Adapted from:
 * https://developer.wordpress.org/block-editor/how-to-guides/metabox/
 */

// Must match the meta field registered by register_post_meta.
export const META_FIELD_KEY = 'example_subtitle';

export function Edit() {
	const blockProps = useBlockProps();
	const postType = useSelect(
		( select ) => select( 'core/editor' ).getCurrentPostType(),
		[]
	);

	const [ meta, setMeta ] = useEntityProp( 'postType', postType, 'meta' );

	const metaValue = meta[ META_FIELD_KEY ];
	const updateMetaValue = ( newValue ) => {
		setMeta( { ...meta, [ META_FIELD_KEY ]: newValue } );
	};

	return (
		<div { ...blockProps }>
			<TextControl
				__nextHasNoMarginBottom
				__next40pxDefaultSize
				label={ __( 'Subtitle', 'example-subtitle' ) }
				onChange={ updateMetaValue }
				value={ metaValue }
			/>
		</div>
	);
}
