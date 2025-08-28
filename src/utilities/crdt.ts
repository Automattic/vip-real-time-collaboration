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
import { generateHash } from '@/utilities/crypto';

export interface EntityMetaRecord {
	[ PERSISTED_STATE_POST_META_KEY ]?: string; // serialized PersistedCrdtDocMetaValue
}

interface PersistedCrdtDocMetaValue {
	/**
	 * IMPORTANT: The content hash is *not* used to invalidate the CRDT document, because:
	 *
	 * 1. We can always merge the latest content into the CRDT document without conflicts.
	 *
	 * 2. Client-side code changes (e.g., to applyChangesToDoc) may change mean that we
	 *    don't "trust" the CRDT document even if the underlying content hasn't changed.
	 */
	contentHash: string;
	crdtDoc: string;
	version: number;
}

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
 * not validate the CRDT document itself.
 */
function isValidCrdtDocMetaValueShape(
	metaValue: unknown,
	expectedVersion: number
): metaValue is PersistedCrdtDocMetaValue {
	if ( 'object' !== typeof metaValue || null === metaValue ) {
		return false;
	}

	if ( ! ( 'contentHash' in metaValue && 'crdtDoc' in metaValue && 'version' in metaValue ) ) {
		return false;
	}

	if ( 'string' !== typeof metaValue.contentHash || ! metaValue.contentHash ) {
		return false;
	}

	if ( 'string' !== typeof metaValue.crdtDoc || ! metaValue.crdtDoc ) {
		return false;
	}

	// Version is an incrementing integer. If the client is ahead of the persisted
	// version, it should be ignored. @TODO: If the client is behind, we may want
	// to notify the user to refresh.
	if ( 'number' !== typeof metaValue.version || metaValue.version !== expectedVersion ) {
		return false;
	}

	return true;
}

function getCrdtDocVersion( crdtDoc: CRDTDoc ): number {
	// Y.Doc.meta is untyped
	const version: unknown = ( crdtDoc.meta as Map< string, unknown > | null )?.get( 'version' );
	const fallbackVersion = 0;

	return 'number' === typeof version ? version : fallbackVersion;
}

/**
 * Create the unserialized entity meta value object.
 */
async function createCrdtDocMetaValue(
	crdtDoc: CRDTDoc,
	rawContent: string
): Promise< PersistedCrdtDocMetaValue > {
	return {
		contentHash: await generateHash( rawContent, 'SHA-256' ),
		crdtDoc: serializeCrdtDoc( crdtDoc ),
		version: getCrdtDocVersion( crdtDoc ),
	};
}

/**
 * Create a serialized entity meta record that is ready to pass to the `meta`
 * field of the WP REST API.
 */
export async function createPersistedCrdtDocMetaRecord(
	crdtDoc: CRDTDoc,
	rawContent: string
): Promise< EntityMetaRecord > {
	const metaValue = await createCrdtDocMetaValue( crdtDoc, rawContent );

	return {
		[ PERSISTED_STATE_POST_META_KEY ]: JSON.stringify( metaValue ),
	};
}

/**
 * Extract and validate a persisted CRDT document from entity meta.
 */
export function getPersistedCrdtDocFromEntityMeta(
	entityMeta: Record< string, unknown >,
	expectedVersion: number
): CRDTDoc | null {
	try {
		// eslint-disable-next-line security/detect-object-injection
		const rawMetaValue: unknown = entityMeta[ PERSISTED_STATE_POST_META_KEY ] ?? null;

		if ( 'string' !== typeof rawMetaValue ) {
			return null;
		}

		const metaValue: unknown = JSON.parse( rawMetaValue );

		if ( ! isValidCrdtDocMetaValueShape( metaValue, expectedVersion ) ) {
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
