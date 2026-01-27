/**
 * Yoast SEO Bridge
 *
 * Connects Yoast SEO's internal state to the meta sync system,
 * enabling real-time collaboration for SEO fields.
 */

import { select, subscribe, dispatch } from '@wordpress/data';

import { Logger } from '@/utilities/logger';

import type { MetaSyncBridge, MetaSyncField } from '../types';

const logger = new Logger( 'yoast-seo-bridge' );

/**
 * Yoast SEO store name.
 */
const YOAST_STORE = 'yoast-seo/editor';

/**
 * Meta keys that Yoast uses.
 */
const YOAST_META_KEYS = {
	title: '_yoast_wpseo_title',
	metadesc: '_yoast_wpseo_metadesc',
	focuskw: '_yoast_wpseo_focuskw',
	canonical: '_yoast_wpseo_canonical',
} as const;

/**
 * Type for WordPress data store selectors.
 */
type StoreSelectors = Record< string, ( () => unknown ) | undefined >;

/**
 * Type for post meta object.
 */
type PostMeta = Record< string, unknown >;

/**
 * Check if Yoast SEO is available.
 */
function isYoastAvailable(): boolean {
	try {
		const store = select( YOAST_STORE );
		return store !== undefined && store !== null;
	} catch {
		return false;
	}
}

/**
 * Get a value from Yoast's store.
 */
function getYoastValue( selector: string ): unknown {
	try {
		const store = select( YOAST_STORE ) as StoreSelectors | null;
		if ( ! store ) {
			return undefined;
		}

		const selectorFn = store[ selector ];
		if ( typeof selectorFn === 'function' ) {
			return selectorFn();
		}

		return undefined;
	} catch ( error: unknown ) {
		logger.debug( `Failed to get Yoast value for ${ selector }`, { error } );
		return undefined;
	}
}

/**
 * Type for Yoast store dispatch with known actions.
 */
type YoastDispatch = {
	updateData: ( data: { title?: string; description?: string; slug?: string } ) => void;
	setFocusKeyword: ( keyword: string ) => void;
};

/**
 * Update snippet editor data (title or description).
 */
function updateSnippetData( field: 'title' | 'description', value: unknown ): void {
	try {
		const storeDispatch = dispatch( YOAST_STORE ) as YoastDispatch | null;
		if ( ! storeDispatch?.updateData ) {
			logger.debug( 'updateData action not available' );
			return;
		}

		storeDispatch.updateData( { [ field ]: value as string } );
		logger.debug( `Called updateData for ${ field }` );
	} catch ( error: unknown ) {
		logger.debug( `Error updating snippet data: ${ field }`, { error } );
	}
}

/**
 * Set the focus keyword.
 */
function setFocusKeyword( value: unknown ): void {
	try {
		const storeDispatch = dispatch( YOAST_STORE ) as YoastDispatch | null;
		if ( ! storeDispatch?.setFocusKeyword ) {
			logger.debug( 'setFocusKeyword action not available' );
			return;
		}

		storeDispatch.setFocusKeyword( value as string );
		logger.debug( 'Called setFocusKeyword' );
	} catch ( error: unknown ) {
		logger.debug( 'Error setting focus keyword', { error } );
	}
}

/**
 * Also sync to core-data meta so it persists on save.
 */
function syncToCoreDataMeta( metaKey: string, value: unknown ): void {
	try {
		const editorSelect = select( 'core/editor' ) as {
			getEditedPostAttribute: ( attr: string ) => PostMeta | undefined;
		};
		const currentMeta: PostMeta = editorSelect.getEditedPostAttribute( 'meta' ) ?? {};
		const currentValue = currentMeta[ metaKey ];

		// Only update if value changed
		if ( currentValue !== value ) {
			const editorDispatch = dispatch( 'core/editor' ) as {
				editPost: ( edits: { meta: PostMeta } ) => void;
			};
			editorDispatch.editPost( {
				meta: {
					...currentMeta,
					[ metaKey ]: value,
				},
			} );
		}
	} catch ( error: unknown ) {
		logger.debug( `Failed to sync to core-data meta: ${ metaKey }`, { error } );
	}
}

/**
 * Create the Yoast SEO bridge.
 */
export function createYoastSeoBridge(): MetaSyncBridge {
	const fields: MetaSyncField[] = [
		{
			key: YOAST_META_KEYS.title,
			getValue: () => getYoastValue( 'getSnippetEditorTitle' ),
			setValue: ( value: unknown ) => {
				updateSnippetData( 'title', value );
				syncToCoreDataMeta( YOAST_META_KEYS.title, value );
			},
		},
		{
			key: YOAST_META_KEYS.metadesc,
			getValue: () => getYoastValue( 'getSnippetEditorDescription' ),
			setValue: ( value: unknown ) => {
				updateSnippetData( 'description', value );
				syncToCoreDataMeta( YOAST_META_KEYS.metadesc, value );
			},
		},
		{
			key: YOAST_META_KEYS.focuskw,
			getValue: () => getYoastValue( 'getFocusKeyphrase' ),
			setValue: ( value: unknown ) => {
				setFocusKeyword( value );
				syncToCoreDataMeta( YOAST_META_KEYS.focuskw, value );
			},
		},
	];

	return {
		id: 'yoast-seo',

		isAvailable: isYoastAvailable,

		getFields: () => fields,

		subscribe: ( callback: ( key: string, value: unknown ) => void ) => {
			// Track previous values to detect changes
			const previousValues: Record< string, unknown > = {};

			// Initialize previous values
			for ( const field of fields ) {
				previousValues[ field.key ] = field.getValue();
			}

			// Subscribe to WordPress data store changes
			// Provided type is generic `Function`.
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			const unsubscribeFn: () => void = subscribe( () => {
				if ( ! isYoastAvailable() ) {
					return;
				}

				for ( const field of fields ) {
					const currentValue = field.getValue();
					const previousValue = previousValues[ field.key ];

					if ( currentValue !== previousValue ) {
						previousValues[ field.key ] = currentValue;
						callback( field.key, currentValue );
					}
				}
			} ) as () => void;

			return unsubscribeFn;
		},
	};
}
