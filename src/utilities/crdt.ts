/**
 * External dependencies
 */
import * as buffer from 'lib0/buffer';
import * as Y from 'yjs';

/**
 * Internal dependencies
 */
import { isDevelopment, PERSISTED_STATE_POST_META_KEY } from '@/utilities/config';
import { Logger } from '@/utilities/logger';

/**
 * WordPress dependencies
 */

import { type CRDTDoc, type SyncConfig } from '@wordpress/sync';

type YBlock = Y.Map<
	/* name, clientId, and originalContent are strings. */
	| string
	/* validationIssues? is an array of strings. */
	| string[]
	/* attributes is a Y.Map< unknown >. */
	| YBlockAttributes
	/* innerBlocks is a Y.Array< YBlock >. */
	| Y.Array< YBlock >
>;

type YBlockAttributes = Y.Map< Y.Text | unknown >;

export interface EntityMetaRecord {
	string?: string; // serialized PersistedCrdtDocMetaValue
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
	lastRevisionId: number;
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
 * not validate the CRDT document itself or the contents of the entity meta value.
 * That's done by isValidCrdtDocMetaContent().
 */
function isValidCrdtDocMetaShape( metaValue: unknown ): metaValue is PersistedCrdtDocMetaValue {
	if ( 'object' !== typeof metaValue || null === metaValue ) {
		logger.debug( 'Persisted CRDT document was not found', { metaValue } );
		return false;
	}

	if (
		! (
			'contentHash' in metaValue &&
			'crdtDoc' in metaValue &&
			'version' in metaValue &&
			'lastRevisionId' in metaValue
		)
	) {
		logger.error( 'Persisted CRDT document is missing expected properties', { metaValue } );
		return false;
	}

	if (
		'string' !== typeof metaValue.contentHash ||
		'string' !== typeof metaValue.crdtDoc ||
		'number' !== typeof metaValue.version ||
		'number' !== typeof metaValue.lastRevisionId
	) {
		logger.error( 'Persisted CRDT document has invalid property types', { metaValue } );
		return false;
	}

	if ( ! metaValue.crdtDoc ) {
		logger.error( 'Persisted CRDT document is empty', { metaValue } );
		return false;
	}

	return true;
}

/**
 * This validates the contents of the deserialized entity meta value shape. That
 * includes validating the content hash and document version.
 */
function isValidCrdtDocMetaContent(
	metaValue: PersistedCrdtDocMetaValue,
	expectedContentHash: string,
	expectedVersion: number
): boolean {
	if ( metaValue.contentHash !== expectedContentHash ) {
		logger.warn( 'Persisted CRDT document content hash mismatch', {
			expectedContentHash,
			metaValue,
		} );
		return false;
	}

	// Version is an incrementing integer. If the client is ahead of the persisted
	// version, it should be ignored. @TODO: If the client is behind, we may want
	// to notify the user to refresh.
	if ( metaValue.version !== expectedVersion ) {
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
	contentHash: string,
	lastRevisionId: number
): PersistedCrdtDocMetaValue {
	return {
		contentHash,
		crdtDoc: serializeCrdtDoc( crdtDoc ),
		version: getCrdtDocVersion( crdtDoc ),
		lastRevisionId,
	};
}

/**
 * Create a serialized entity meta record that is ready to pass to the `meta`
 * field of the WP REST API.
 */
export function createPersistedCrdtDocMetaRecord(
	crdtDoc: CRDTDoc,
	contentHash: string,
	lastRevisionId: number
): EntityMetaRecord {
	if ( ! PERSISTED_STATE_POST_META_KEY ) {
		logger.error( 'Persisted post meta key is undefined' );
		return {};
	}

	const metaValue = createCrdtDocMetaValue( crdtDoc, contentHash, lastRevisionId );

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
		const metaValue: PersistedCrdtDocMetaValue | null = getRawCRDTDocMetaValue( entityMeta );

		if (
			! metaValue ||
			! isValidCrdtDocMetaContent( metaValue, expectedContentHash, expectedVersion )
		) {
			return null;
		}

		return deserializeCrdtDoc( metaValue.crdtDoc, metaValue.version );
	} catch {
		return null;
	}
}

export function overrideFromCRDTDocStringToCRDTDoc(
	sourceCrdtDocString: string,
	destinationCrdtDoc: CRDTDoc,
	syncConfig: SyncConfig
): void {
	// Properties that could cause footguns if copied over.
	const propertiesToSkip = [ 'slug', 'generated_slug', '_links', 'meta' ];
	const sourceCrdtDoc = deserializeCrdtDoc( sourceCrdtDocString );
	const sourceYMap = sourceCrdtDoc.getMap( 'document' );
	const destinationYMap = destinationCrdtDoc.getMap( 'document' );

	syncConfig.syncedProperties.forEach( property => {
		if ( propertiesToSkip.includes( property ) ) {
			return;
		}

		if ( property === 'blocks' ) {
			const currentBlocks = ( sourceYMap.get( 'blocks' ) as Y.Array< YBlock > ).clone();
			destinationYMap.set( 'blocks', currentBlocks );
		} else if ( property === 'title' ) {
			// ToDo: Title sometimes doesn't get updated correctly. Need to investigate this further
			const currentTitle = sourceYMap.get( 'title' ) as string;
			logger.debug( 'Setting title from restored revision', { property, currentTitle } );
			destinationYMap.set( 'title', currentTitle );
		} else if ( destinationYMap.has( property ) && ! sourceYMap.has( property ) ) {
			// This for properties that have been added in the future.
			destinationYMap.delete( property );
		} else if ( sourceYMap.has( property ) && sourceYMap.get( property ) !== undefined ) {
			// This is for properties that have been deleted in the future or have updated.
			const propertyValue = sourceYMap.get( property );
			destinationYMap.set( property, propertyValue );
		}
	} );

	sourceCrdtDoc.destroy();
}

/**
 * Extract the raw PersistedCrdtDocMetaValue from entity meta, and validate its shape.
 *
 * This does not validate the contents of the meta value, like the content hash or version.
 */
export function getRawCRDTDocMetaValue(
	entityMeta: Record< string, unknown >
): PersistedCrdtDocMetaValue | null {
	try {
		if ( ! PERSISTED_STATE_POST_META_KEY ) {
			logger.error( 'Persisted post meta key is undefined' );
			return null;
		}

		// eslint-disable-next-line security/detect-object-injection
		const rawMetaValue: unknown = entityMeta[ PERSISTED_STATE_POST_META_KEY ] ?? null;

		if ( 'string' !== typeof rawMetaValue || rawMetaValue === '' ) {
			return null;
		}

		const metaValue: unknown = JSON.parse( rawMetaValue );

		if ( ! isValidCrdtDocMetaShape( metaValue ) ) {
			return null;
		}

		return metaValue;
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
