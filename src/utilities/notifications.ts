import { dispatch, select } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';

import { store as settingsStore, Setting } from '@/store/settings-store';

import type { UserInfo } from '@wordpress/core-data';

export enum NotificationType {
	PostUpdated = 'remote-user-post-updated',
	UserEntered = 'remote-user-user-entered',
	UserExited = 'remote-user-user-exited',
}

const NOTIFICATION_TYPE_TO_SETTING_MAP: Record< NotificationType, Setting > = {
	[ NotificationType.PostUpdated ]: Setting.POST_UPDATE_NOTIFICATION,
	[ NotificationType.UserEntered ]: Setting.USER_ENTER_NOTIFICATION,
	[ NotificationType.UserExited ]: Setting.USER_EXIT_NOTIFICATION,
};

/**
 * Get the content of a post updated or draft saved notification.
 *
 * @param userInfo the user info of the user related to the notification
 * @param status the status of the post
 * @returns the content of the post updated or draft saved notification
 */
function getPostUpdatedNotificationContent( userInfo: UserInfo, status: string ): string {
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
function getUserPresenceNotificationContent( userInfo: UserInfo, type: NotificationType ): string {
	const action = type === NotificationType.UserEntered ? 'entered' : 'exited';
	return `${ userInfo.name } has ${ action } the post.`;
}

function shouldSendNotification(
	userInfo: UserInfo,
	type: NotificationType,
	content: string,
	currentMeUserInfo?: UserInfo
): boolean {
	// If content is empty, skip.
	if ( ! content ) {
		return false;
	}

	// If the notification type has no settings associated with it, send it.
	const setting = NOTIFICATION_TYPE_TO_SETTING_MAP[ type ];
	if ( ! setting ) {
		return true;
	}

	// If the setting for this notification type is disabled, skip.
	if ( ! select( settingsStore ).getSetting( setting ) ) {
		return false;
	}

	// If the current user is the one who joined/left, skip.
	if (
		( type === NotificationType.UserEntered || type === NotificationType.UserExited ) &&
		userInfo.id === currentMeUserInfo?.id
	) {
		return false;
	}

	// The user has just recently entered or re-joined, and doesn't need to be told about the other collaborators.
	if (
		type === NotificationType.UserEntered &&
		currentMeUserInfo &&
		currentMeUserInfo.enteredAt > userInfo.enteredAt
	) {
		return false;
	}

	// Otherwise, send the notification.
	return true;
}

function getContentForNotificationType(
	userInfo: UserInfo,
	type: NotificationType,
	status?: string
): string {
	switch ( type ) {
		case NotificationType.PostUpdated:
			return getPostUpdatedNotificationContent( userInfo, status ?? '' );
		case NotificationType.UserEntered:
		case NotificationType.UserExited:
			return getUserPresenceNotificationContent( userInfo, type );
		default:
			return '';
	}
}

/**
 * Send a notification to the editor.
 *
 * Certain notifications can be skipped based on user settings, or scenarios.
 *
 * @param type The type of notification to send.
 * @param userInfoToSendAbout The user info of the user related to the notification.
 * @param status The status of the post (only relevant for PostUpdated notifications).
 * @param currentMeUserInfo The user info of the current user (only relevant for user entered notifications).
 */
export function sendNotification(
	type: NotificationType,
	userInfoToSendAbout: UserInfo,
	status?: string,
	currentMeUserInfo?: UserInfo
): void {
	// This is done on purpose, to allow tests to be written without noticesStore.
	const { createNotice } = dispatch( noticesStore );

	// Get the content for the notification type.
	const content = getContentForNotificationType( userInfoToSendAbout, type, status );

	// Skip notifications for certain cases.
	if ( ! shouldSendNotification( userInfoToSendAbout, type, content, currentMeUserInfo ) ) {
		return;
	}

	// Send the notification, via a notice.
	void createNotice( 'info', content, {
		id: `${ type }-${ userInfoToSendAbout.id }`,
		isDismissible: false,
		type: 'snackbar',
	} );
}
