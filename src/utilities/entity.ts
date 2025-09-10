import { store as coreStore } from '@wordpress/core-data';
import { select } from '@wordpress/data';

import { generateHash } from '@/utilities/crypto';

import type { WordPressUserInfo } from '@/store/awareness-store';
import type { ObjectData } from '@wordpress/sync';

interface BlockAttributes {
	[ key: string ]: unknown;
}

interface Block {
	attributes: BlockAttributes;
	innerBlocks: Block[];
	name: string;
}

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
	record: ObjectData,
	syncedProperties: Set< string >
): Promise< string > {
	// Get a string representation of the record that includes only the properties
	// that are synced. This is used to determine if the record has changed in a
	// meaningful way that should invalidate a persisted CRDT document.
	const hashInput: string = JSON.stringify(
		Object.fromEntries(
			[ ...syncedProperties ].map( key => [ key, getRawStringValue( record, key ) ] )
		)
	);

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
