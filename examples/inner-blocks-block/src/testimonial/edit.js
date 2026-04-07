/**
 * External dependencies
 */
import { useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

/**
 * A testimonial block that uses inner blocks for its content. The inner blocks
 * are part of the post content, so they sync automatically between peers during
 * collaborative editing. No special RTC code is needed.
 */

const TEMPLATE = [
	[
		'core/columns',
		{},
		[
			[
				'core/column',
				{ width: '33.33%' },
				[ [ 'core/image' ] ],
			],
			[
				'core/column',
				{ width: '66.66%' },
				[
					[
						'core/heading',
						{
							level: 4,
							placeholder: __( "Person's name", 'example-testimonial' ),
						},
					],
					[
						'core/quote',
						{
							placeholder:
								__( 'Write a testimonial quote', 'example-testimonial' ),
						},
					],
				],
			],
		],
	],
];

export function Edit() {
	const blockProps = useBlockProps();
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		template: TEMPLATE,
	} );

	return <div { ...innerBlocksProps } />;
}
