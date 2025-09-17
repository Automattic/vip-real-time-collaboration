/**
 * External dependencies
 */
import { type CRDTDoc } from '@wordpress/sync';
import * as buffer from 'lib0/buffer';
import * as Y from 'yjs';

/**
 * Internal dependencies
 */
import { isDevelopment, PERSISTED_STATE_POST_META_KEY } from '@/utilities/config';
import { Logger } from '@/utilities/logger';

export interface EntityMetaRecord {
	string?: string; // serialized PersistedCrdtDocMetaValue
}

interface PersistedCrdtDocMetaValue {
	/**
	 * This content hash is used to invalidate the CRDT document in case the record
	 * has meaningfully changed "out-of-band" (example: via a WP-CLI command that
	 * mutates content).
	 */
	contentHash: string;
	crdtDoc: string;
}

const logger = new Logger( 'crdt' );

function serializeCrdtDoc( crdtDoc: CRDTDoc ): string {
	return buffer.toBase64( Y.encodeStateAsUpdateV2( crdtDoc ) );
}

function deserializeCrdtDoc( serializedCrdtDoc: string ): CRDTDoc {
	const docMeta = new Map< string, unknown >();
	const ydoc = new Y.Doc( { meta: docMeta } );
	const yupdate = buffer.fromBase64( serializedCrdtDoc );
	Y.applyUpdateV2( ydoc, yupdate );

	ydoc.clientID = Math.floor( Math.random() * 1000000000 );

	return ydoc;
}

/**
 * Type predicate to check the deserialized entity meta value shape. This does
 * not validate the CRDT document itself, but it does validate the content hash.
 */
function isValidCrdtDocMetaValue(
	metaValue: unknown,
	expectedContentHash: string
): metaValue is PersistedCrdtDocMetaValue {
	if ( 'object' !== typeof metaValue || null === metaValue ) {
		logger.debug( 'Persisted CRDT document was not found', { metaValue } );
		return false;
	}

	if ( ! ( 'contentHash' in metaValue && 'crdtDoc' in metaValue ) ) {
		logger.error( 'Persisted CRDT document is missing expected properties', { metaValue } );
		return false;
	}

	if (
		'string' !== typeof metaValue.contentHash ||
		metaValue.contentHash !== expectedContentHash
	) {
		logger.warn( 'Persisted CRDT document content hash mismatch', {
			expectedContentHash,
			metaValue,
		} );
		return false;
	}

	if ( 'string' !== typeof metaValue.crdtDoc || ! metaValue.crdtDoc ) {
		logger.error( 'Persisted CRDT document is empty', { metaValue } );
		return false;
	}

	return true;
}

/**
 * Create the unserialized entity meta value object.
 */
function createCrdtDocMetaValue(
	crdtDoc: CRDTDoc,
	contentHash: string
): PersistedCrdtDocMetaValue {
	return {
		contentHash,
		crdtDoc: serializeCrdtDoc( crdtDoc ),
	};
}

/**
 * Create a serialized entity meta record that is ready to pass to the `meta`
 * field of the WP REST API.
 */
export function createPersistedCrdtDocMetaRecord(
	crdtDoc: CRDTDoc,
	contentHash: string
): EntityMetaRecord {
	if ( ! PERSISTED_STATE_POST_META_KEY ) {
		logger.error( 'Persisted post meta key is undefined' );
		return {};
	}

	const metaValue = createCrdtDocMetaValue( crdtDoc, contentHash );

	return {
		[ PERSISTED_STATE_POST_META_KEY ]: JSON.stringify( metaValue ),
	};
}

/**
 * Extract and validate a persisted CRDT document from entity meta.
 */
export function getPersistedCrdtDocFromEntityMeta(
	entityMeta: Record< string, unknown >,
	expectedContentHash: string
): CRDTDoc | null {
	try {
		if ( ! PERSISTED_STATE_POST_META_KEY ) {
			logger.error( 'Persisted post meta key is undefined' );
			return null;
		}

		// eslint-disable-next-line security/detect-object-injection
		const rawMetaValue: unknown = entityMeta[ PERSISTED_STATE_POST_META_KEY ] ?? null;

		if ( 'string' !== typeof rawMetaValue ) {
			return null;
		}

		const metaValue: unknown = JSON.parse( rawMetaValue );

		if ( ! isValidCrdtDocMetaValue( metaValue, expectedContentHash ) ) {
			return null;
		}

		return deserializeCrdtDoc( metaValue.crdtDoc );
	} catch {
		return null;
	}
}

// Provide some debugging utilities in development mode.
if ( isDevelopment() ) {
	window.VIP_RTC.debug.deserializeCrdtAsJson = ( serializedCrdtDoc: string ): object | null => {
		return deserializeCrdtDoc( serializedCrdtDoc ).getMap( 'document' ).toJSON();
	};
}
