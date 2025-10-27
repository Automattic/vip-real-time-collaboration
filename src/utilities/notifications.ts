import { dispatch, select } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';

import { store as settingsStore, Setting } from '@/store/settings-store';

import type { UserInfo } from '@/store/awareness-store';

export enum NotificationType {
	PostRestored = 'remote-user-post-restored',
	PostUpdated = 'remote-user-post-updated',
	UserEntered = 'remote-user-post-user-entered',
	UserExited = 'remote-user-post-user-exited',
}

/**
 * Get the content of a post restored notification.
 *
 * @param userInfo the user info of the user related to the notification
 * @returns the content of the post restored notification
 */
export function getPostRestoredNotificationContent( userInfo: UserInfo ): string {
	let predicate = `${ userInfo.name } restored`;
	if ( userInfo.isMe ) {
		predicate = 'Restored';
	}

	return `${ predicate } newer content from the server.`;
}

/**
 * Get the content of a post updated or draft saved notification.
 *
 * @param userInfo the user info of the user related to the notification
 * @param status the status of the post
 * @returns the content of the post updated or draft saved notification
 */
export function getPostUpdatedNotificationContent( userInfo: UserInfo, status: string ): string {
	let noun = 'Draft';
	let verb = 'saved';

	if ( [ 'future', 'private', 'publish' ].includes( status ) ) {
		noun = 'Post';
		verb = 'updated';
	}

	return `${ noun } ${ verb } by ${ userInfo.name }.`;
}

/**
 * Get the content of a user presence notification, based on the type.
 *
 * @param userInfo the user info of the user related to the notification
 * @param type the type of notification
 * @returns the content of the user presence notification
 */
export function getUserPresenceNotificationContent(
	userInfo: UserInfo,
	type: NotificationType
): string {
	const action = type === NotificationType.UserEntered ? 'entered' : 'exited';
	return `${ userInfo.name } has ${ action } the post.`;
}

function shouldSendNotification( userState: UserInfo, type: NotificationType ): boolean {
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
 * @param userInfo the user info of the user related to the notification
 * @param type the type of notification
 */
export function sendNotification(
	content: string,
	userInfo: UserInfo,
	type: NotificationType
): void {
	const { createNotice } = dispatch( noticesStore );

	// Skip notifications for certain cases.
	if ( ! shouldSendNotification( userInfo, type ) ) {
		return;
	}

	// Send the notification, via a notice.
	void createNotice( 'info', content, {
		id: `${ type }-${ userInfo.clientId }`,
		isDismissible: false,
		type: 'snackbar',
	} );
}
