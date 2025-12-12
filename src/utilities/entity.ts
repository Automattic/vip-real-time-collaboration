import { store as coreStore } from '@wordpress/core-data';
import { select, resolveSelect } from '@wordpress/data';

import type { WordPressUserInfo } from '@/awareness/awareness-types';
import type { User } from '@wordpress/core-data/build-types/entity-types';

async function getUserEmail( userId: number ): Promise< string | undefined > {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
	const user = ( await resolveSelect( coreStore ).getUser( userId, {
		context: 'edit',
	} ) ) as User< 'edit' > | undefined;
	return user?.email;
}

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
	const email = await getUserEmail( id );

	return { avatarUrl, id, name: name ?? slug, email: email ?? '' };
}
