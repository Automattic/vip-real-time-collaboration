import { store as coreStore } from '@wordpress/core-data';
import { select } from '@wordpress/data';

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

/**
 * Extract the raw content from an entity record.
 */
export function getRawContentFromEntityRecord( record: ObjectData ): string | null {
	// Content may be a string property or a nested object with a `raw` property.
	const content = 'content' in record ? record.content : null;

	if ( 'string' === typeof content ) {
		return content;
	}

	return content &&
		'object' === typeof content &&
		'raw' in content &&
		'string' === typeof content.raw
		? content.raw
		: null;
}

/**
 * Extract the meta object from an entity record.
 */
export function getMetaFromEntityRecord( record: ObjectData ): Record< string, unknown > {
	return 'meta' in record && record.meta && 'object' === typeof record.meta
		? ( record.meta as Record< string, unknown > )
		: {};
}
