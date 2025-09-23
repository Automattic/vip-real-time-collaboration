import type { UserState } from '@/store/awareness-store';

export function getPostRestoredNotificationContent( userState: UserState ): string {
	let predicate = `${ userState.name } restored`;
	if ( userState.isMe ) {
		predicate = 'Restored';
	}

	return `${ predicate } newer content from the server.`;
}

export function getPostUpdatedNotificationContent( userState: UserState, status: string ): string {
	let noun = 'Draft';
	let verb = 'saved';

	if ( [ 'future', 'private', 'publish' ].includes( status ) ) {
		noun = 'Post';
		verb = 'updated';
	}

	return `${ noun } ${ verb } by ${ userState.name }.`;
}
