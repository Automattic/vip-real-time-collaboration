import { store as coreStore } from '@wordpress/core-data';
import { select } from '@wordpress/data';

import { generateHash } from '@/utilities/crypto';

import type { WordPressUserInfo } from '@/store/awareness-store';
import type { ObjectData } from '@wordpress/sync';

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

export async function getHashForEntityRecord( record: ObjectData ): Promise< string > {
	const content = getRawValueFromEntityRecord( record, 'content' ) ?? '';
	const title = getRawValueFromEntityRecord( record, 'title' ) ?? '';

	// Add more record fields that should invalidate a persisted CRDT doc here. In
	// the future, this should be controlled by the entity's sync config.

	const hashInput = JSON.stringify( { content, title } );
	return await generateHash( hashInput, 'SHA-256' );
}

/**
 * Extract the meta object from an entity record.
 */
export function getMetaFromEntityRecord( record: ObjectData ): Record< string, unknown > {
	return 'meta' in record && record.meta && 'object' === typeof record.meta ? record.meta : {};
}

/**
 * Extract the raw value from an entity record like content or title that
 * may be a string or an object with a `raw` property.
 */
export function getRawValueFromEntityRecord(
	record: ObjectData,
	key: 'content' | 'title'
): string | null {
	// Value may be a string property or a nested object with a `raw` property.
	// eslint-disable-next-line security/detect-object-injection
	const value = key in record ? record[ key ] : null;

	if ( 'string' === typeof value ) {
		return value;
	}

	return value && 'object' === typeof value && 'raw' in value && 'string' === typeof value.raw
		? value.raw
		: null;
}
