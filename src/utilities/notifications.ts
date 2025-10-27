import type { UserInfo } from '@/store/awareness-store';

export function getPostRestoredNotificationContent( userInfo: UserInfo ): string {
	let predicate = `${ userInfo.name } restored`;
	if ( userInfo.isMe ) {
		predicate = 'Restored';
	}

	return `${ predicate } newer content from the server.`;
}

export function getPostUpdatedNotificationContent( userInfo: UserInfo, status: string ): string {
	let noun = 'Draft';
	let verb = 'saved';

	if ( [ 'future', 'private', 'publish' ].includes( status ) ) {
		noun = 'Post';
		verb = 'updated';
	}

	return `${ noun } ${ verb } by ${ userInfo.name }.`;
}
