import { store as coreStore } from '@wordpress/core-data';
import { select } from '@wordpress/data';

import type { WordPressUserInfo } from '@/store/awareness-store';

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
