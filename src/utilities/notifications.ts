import { store as noticesStore } from '@wordpress/notices';
import { dispatch, select } from '@wordpress/data';
import type { UserState } from '@/store/awareness-store';
import { store as settingsStore, Setting } from '@/store/settings-store';

export enum NotificationType {
	PostRestored = 'remote-user-post-restored',
	PostUpdated = 'remote-user-post-updated',
	UserEntered = 'remote-user-post-user-entered',
	UserExited = 'remote-user-post-user-exited',
}

/**
 * Get the content of a post restored notification.
 *
 * @param userState the user state of the user related to the notification
 * @returns the content of the post restored notification
 */
export function getPostRestoredNotificationContent( userState: UserState ): string {
	let predicate = `${ userState.name } restored`;
	if ( userState.isMe ) {
		predicate = 'Restored';
	}

	return `${ predicate } newer content from the server.`;
}

/**
 * Get the content of a post updated or draft saved notification.
 *
 * @param userState the user state of the user related to the notification
 * @param status the status of the post
 * @returns the content of the post updated or draft saved notification
 */
export function getPostUpdatedNotificationContent( userState: UserState, status: string ): string {
	let noun = 'Draft';
	let verb = 'saved';

	if ( [ 'future', 'private', 'publish' ].includes( status ) ) {
		noun = 'Post';
		verb = 'updated';
	}

	return `${ noun } ${ verb } by ${ userState.name }.`;
}

/**
 * Get the content of a user presence notification, based on the type.
 *
 * @param userState the user state of the user related to the notification
 * @param type the type of notification
 * @returns the content of the user presence notification
 */
export function getUserPresenceNotificationContent(
	userState: UserState,
	type: NotificationType
): string {
	let action = type === NotificationType.UserEntered ? 'entered' : 'exited';
	return `${ userState.name } has ${ action } the post.`;
}

function shouldSendNotification( userState: UserState, type: NotificationType ): boolean {
	// If notifications for user joining is disabled, skip.
	if (
		type === NotificationType.UserEntered &&
		! select( settingsStore ).getSetting( Setting.USER_ENTER_NOTIFICATION )
	) {
		return false;
	}

	// If notifications for user leaving is disabled, skip.
	if (
		type === NotificationType.UserExited &&
		! select( settingsStore ).getSetting( Setting.USER_EXIT_NOTIFICATION )
	) {
		return false;
	}

	// If the current user is the one who joined/left, skip.
	if (
		( type === NotificationType.UserEntered || type === NotificationType.UserExited ) &&
		userState.isMe
	) {
		return false;
	}

	return true;
}

/**
 * Send a notification to the editor.
 *
 * Certain notifications can be skipped based on user settings, or scenarios.
 *
 * @param content the notification content
 * @param userState the user state of the user related to the notification
 * @param type the type of notification
 */
export function sendNotification(
	content: string,
	userState: UserState,
	type: NotificationType
): void {
	const { createNotice } = dispatch( noticesStore );

	// Skip notifications for certain cases.
	if ( ! shouldSendNotification( userState, type ) ) {
		return;
	}

	// Send the notification, via a notice.
	void createNotice( 'info', content, {
		id: `${ type }-${ userState.clientId }`,
		isDismissible: false,
		type: 'snackbar',
	} );
}
