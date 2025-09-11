/**
 * External dependencies
 */
import { registerBlockType } from '@wordpress/blocks';
import { addFilter } from '@wordpress/hooks';

/**
 * Internal dependencies
 */
import metadata from './block.json';
import { Edit, META_FIELD_KEY } from './edit';
import { Save } from './save';

// Register the block.
registerBlockType( metadata.name, {
	edit: Edit,
	save: Save,
} );

// Filter the synced meta properties to include our meta field.
addFilter( 'sync.metaProperties', 'vip-rtc-examples', ( metaProperties ) => {
	metaProperties.push( META_FIELD_KEY );
	return metaProperties;
} );
