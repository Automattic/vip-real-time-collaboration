import { store as coreStore } from '@wordpress/core-data';
import { select } from '@wordpress/data';

import { generateHash } from '@/utilities/crypto';

import type { WordPressUserInfo } from '@/store/awareness-store';
import type { ObjectData, SyncConfig } from '@wordpress/sync';

export async function getCurrentUserInfo(): Promise< WordPressUserInfo > {
	const { avatar_urls: avatarUrls, id, name } = select( coreStore ).getCurrentUser() ?? {};

	if ( ! id ) {
		// getCurrentUser() returns an empty user object for a short time after load.
		// In that case, wait and try again.
		await new Promise( resolve => setTimeout( resolve, 100 ) );
		return await getCurrentUserInfo();
	}
	const avatarUrl = avatarUrls?.[ 24 ] || avatarUrls?.[ 48 ] || avatarUrls?.[ 96 ];

	return { avatarUrl, id, name };
}

export async function getHashForEntityRecord(
	rawRecord: ObjectData,
	syncConfig: SyncConfig
): Promise< string > {
	const objectData = syncConfig.getInitialObjectData( rawRecord );

	// We remove the blocks and use the content as a proxy for the blocks, since
	// blocks are a derived property with unstable identifiers (clientIds).
	//
	// We also remove the date since that is updated by the server on save and
	// this hash must be computed before the record is saved.
	//
	// TODO: This should ideally be controlled by the SyncConfig, but since we
	// don't yet want to introduce hashing utilities to Gutenberg, this logic will
	// temporarily live here.
	const { blocks: _discard, date: _discard2, ...rest } = objectData;
	const record = { ...rest, content: getRawStringValue( rawRecord, 'content' ) };

	// Get a string representation of the object data. It should include only the
	// synced properties. This is used to determine if the record has changed in a
	// meaningful way that should invalidate a persisted CRDT document.
	const hashInput: string = JSON.stringify( record, Object.keys( record ).sort() );

	return await generateHash( hashInput, 'SHA-256' );
}

/**
 * Extract the meta object from an entity record.
 */
export function getMetaFromEntityRecord( record: ObjectData ): Record< string, unknown > {
	return 'meta' in record && record.meta && 'object' === typeof record.meta
		? ( record.meta as Record< string, unknown > )
		: {};
}

/**
 * Extract the raw string value from an entity property that may be a string or
 * an object with a `raw` property.
 */
function getRawStringValue( record: ObjectData, key: string ): string {
	// eslint-disable-next-line security/detect-object-injection
	const value = key in record ? record[ key ] : null;

	if ( 'string' === typeof value ) {
		return value;
	}

	return value && 'object' === typeof value && 'raw' in value && 'string' === typeof value.raw
		? value.raw
		: '';
}
