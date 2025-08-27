/**
 * External dependencies
 */
import * as buffer from 'lib0/buffer';
import * as Y from 'yjs';

/**
 * Internal dependencies
 */
import { CRDT_DOC_VERSION, isDevelopment, PERSISTED_STATE_POST_META_KEY } from '@/utilities/config';
import { generateHash } from '@/utilities/crypto';

import type { CRDTDoc } from '@wordpress/sync';

export interface MetaRecord {
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

function deserializeCrdtDoc( serializedCrdtDoc: string ): CRDTDoc {
	const ydoc = new Y.Doc();
	const yupdate = buffer.fromBase64( serializedCrdtDoc );
	Y.applyUpdateV2( ydoc, yupdate );

	ydoc.clientID = Math.floor( Math.random() * 1000000000 );

	return ydoc;
}

/**
 * Type predicate to check the deserialized meta value shape. This does not
 * validate the CRDT document itself.
 */
function isValidCrdtDocMetaValueShape(
	metaValue: unknown
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
	if ( 'number' !== typeof metaValue.version || metaValue.version !== CRDT_DOC_VERSION ) {
		return false;
	}

	return true;
}

/**
 * Create the unserialized meta value object.
 */
async function createCrdtDocMetaValue(
	crdtDoc: CRDTDoc,
	rawContent: string
): Promise< PersistedCrdtDocMetaValue > {
	return {
		contentHash: await generateHash( rawContent, 'SHA-256' ),
		crdtDoc: serializeCrdtDoc( crdtDoc ),
		version: CRDT_DOC_VERSION,
	};
}

/**
 * Create a serialized meta record that is ready to pass to the `meta` field of
 * the WP REST API.
 */
export async function createPersistedCrdtDocMetaRecord(
	crdtDoc: CRDTDoc,
	rawContent: string
): Promise< MetaRecord > {
	const metaValue = await createCrdtDocMetaValue( crdtDoc, rawContent );

	return {
		[ PERSISTED_STATE_POST_META_KEY ]: JSON.stringify( metaValue ),
	};
}

/**
 * Extract and validate a persisted CRDT document from post meta.
 */
export function getPersistedCrdtDocFromMeta( meta: Record< string, unknown > ): CRDTDoc | null {
	try {
		// eslint-disable-next-line security/detect-object-injection
		const rawMetaValue = meta[ PERSISTED_STATE_POST_META_KEY ] ?? null;

		if ( 'string' !== typeof rawMetaValue ) {
			return null;
		}

		const metaValue: unknown = JSON.parse( rawMetaValue );

		if ( ! isValidCrdtDocMetaValueShape( metaValue ) ) {
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
