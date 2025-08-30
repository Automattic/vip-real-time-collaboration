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
	[ PERSISTED_STATE_POST_META_KEY ]?: string; // serialized PersistedCrdtDocMetaValue
}

interface PersistedCrdtDocMetaValue {
	/**
	 * This content hash is used to invalidate the CRDT document in case the record
	 * has meaningfully changed "out-of-band" (example: via a WP-CLI command that
	 * mutates content).
	 *
	 * Client-side code changes (e.g., to applyChangesToDoc) may also require
	 * invalidation, but that should happen via an incremented `version` number.
	 */
	contentHash: string;
	crdtDoc: string;
	version: number;
}

const logger = new Logger( 'crdt' );

function serializeCrdtDoc( crdtDoc: CRDTDoc ): string {
	return buffer.toBase64( Y.encodeStateAsUpdateV2( crdtDoc ) );
}

function deserializeCrdtDoc( serializedCrdtDoc: string, version = 0 ): CRDTDoc {
	const docMeta = new Map< string, unknown >( [ [ 'version', version ] ] );
	const ydoc = new Y.Doc( { meta: docMeta } );
	const yupdate = buffer.fromBase64( serializedCrdtDoc );
	Y.applyUpdateV2( ydoc, yupdate );

	ydoc.clientID = Math.floor( Math.random() * 1000000000 );

	return ydoc;
}

/**
 * Type predicate to check the deserialized entity meta value shape. This does
 * not validate the CRDT document itself, but it does validate the content hash
 * and document version.
 */
function isValidCrdtDocMetaValueShape(
	metaValue: unknown,
	expectedContentHash: string,
	expectedVersion: number
): metaValue is PersistedCrdtDocMetaValue {
	if ( 'object' !== typeof metaValue || null === metaValue ) {
		logger.debug( 'Persisted CRDT document was not found', { metaValue } );
		return false;
	}

	if ( ! ( 'contentHash' in metaValue && 'crdtDoc' in metaValue && 'version' in metaValue ) ) {
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

	// Version is an incrementing integer. If the client is ahead of the persisted
	// version, it should be ignored. @TODO: If the client is behind, we may want
	// to notify the user to refresh.
	if ( 'number' !== typeof metaValue.version || metaValue.version !== expectedVersion ) {
		logger.warn( 'Persisted CRDT document version mismatch', { expectedVersion, metaValue } );
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
		version: getCrdtDocVersion( crdtDoc ),
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
	const metaValue = createCrdtDocMetaValue( crdtDoc, contentHash );

	return {
		[ PERSISTED_STATE_POST_META_KEY ]: JSON.stringify( metaValue ),
	};
}

/**
 * Get a CRDT document's version from document meta.
 */
export function getCrdtDocVersion( crdtDoc: CRDTDoc ): number {
	// Y.Doc.meta is untyped
	const version: unknown = ( crdtDoc.meta as Map< string, unknown > | null )?.get( 'version' );
	const fallbackVersion = 0;

	return 'number' === typeof version ? version : fallbackVersion;
}

/**
 * Extract and validate a persisted CRDT document from entity meta.
 */
export function getPersistedCrdtDocFromEntityMeta(
	entityMeta: Record< string, unknown >,
	expectedContentHash: string,
	expectedVersion: number
): CRDTDoc | null {
	try {
		// eslint-disable-next-line security/detect-object-injection
		const rawMetaValue: unknown = entityMeta[ PERSISTED_STATE_POST_META_KEY ] ?? null;

		if ( 'string' !== typeof rawMetaValue ) {
			return null;
		}

		const metaValue: unknown = JSON.parse( rawMetaValue );

		if ( ! isValidCrdtDocMetaValueShape( metaValue, expectedContentHash, expectedVersion ) ) {
			return null;
		}

		return deserializeCrdtDoc( metaValue.crdtDoc, metaValue.version );
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
