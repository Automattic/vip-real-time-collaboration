import { store as coreStore } from '@wordpress/core-data';
import { select } from '@wordpress/data';

import type { WordPressUserInfo } from '@/awareness/awareness-types';

export async function getCurrentUserInfo(): Promise< WordPressUserInfo > {
	const currentUser = select( coreStore ).getCurrentUser() ?? {};
	const { avatar_urls: avatarUrls, id, name, slug } = currentUser;

	if ( ! id ) {
		// getCurrentUser() returns an empty user object for a short time after load.
		// In that case, wait and try again.
		await new Promise( resolve => setTimeout( resolve, 100 ) );
		return await getCurrentUserInfo();
	}
	const avatarUrl = avatarUrls?.[ 48 ] || avatarUrls?.[ 96 ] || avatarUrls?.[ 24 ];

	return { avatarUrl, id, name: name ?? slug };
}
