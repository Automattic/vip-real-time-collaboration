/**
 * External dependencies
 */
import { useBlockProps } from '@wordpress/block-editor';
import { Button, CheckboxControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import './editor.css';

/**
 * A checklist block with an animated progress bar. The items are stored as a
 * block attribute (an array of objects), so they sync automatically between
 * peers during collaborative editing. No special RTC code is needed.
 */
export function Edit( { attributes, setAttributes } ) {
	const { items } = attributes;
	const blockProps = useBlockProps();

	const checkedCount = items.filter( ( item ) => item.checked ).length;
	const percentage =
		items.length > 0
			? Math.round( ( checkedCount / items.length ) * 100 )
			: 0;

	const updateItem = ( index, changes ) => {
		const newItems = items.map( ( item, i ) => {
			if ( i === index ) {
				return { ...item, ...changes };
			}
			return item;
		} );

		setAttributes( { items: newItems } );
	};

	const removeItem = ( index ) => {
		const newItems = items.filter( ( _, i ) => i !== index );

		setAttributes( { items: newItems } );
	};

	const addItem = () => {
		setAttributes( {
			items: [ ...items, { text: '', checked: false } ],
		} );
	};

	return (
		<div { ...blockProps }>
			<div className="checklist-progress">
				<div className="checklist-progress__label">
					{ checkedCount } { __( 'of', 'example-checklist' ) }{ ' ' }
					{ items.length } { __( 'complete', 'example-checklist' ) }
				</div>
				<div className="checklist-progress__bar">
					<div
						className="checklist-progress__fill"
						style={ { width: `${ percentage }%` } }
					/>
				</div>
			</div>

			{ items.map( ( item, index ) => (
				<div key={ index } className="checklist-item">
					<CheckboxControl
						__nextHasNoMarginBottom
						checked={ item.checked }
						onChange={ ( checked ) =>
							updateItem( index, { checked } )
						}
					/>
					<input
						type="text"
						className="checklist-item__text"
						value={ item.text }
						onChange={ ( event ) =>
							updateItem( index, {
								text: event.target.value,
							} )
						}
						placeholder={ __(
							'Checklist item',
							'example-checklist'
						) }
					/>
					<Button
						icon="no-alt"
						size="small"
						label={ __( 'Remove item', 'example-checklist' ) }
						onClick={ () => removeItem( index ) }
					/>
				</div>
			) ) }

			<Button
				className="checklist-add"
				variant="secondary"
				onClick={ addItem }
			>
				{ __( 'Add item', 'example-checklist' ) }
			</Button>
		</div>
	);
}
