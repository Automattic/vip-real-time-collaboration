import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
	getPostRestoredNotificationContent,
	getPostUpdatedNotificationContent,
	getUserPresenceNotificationContent,
	NotificationType,
} from './notifications';

import type { UserInfo } from '@/store/awareness-store';

const baseUserInfo: UserInfo = {
	id: 1,
	name: 'Alice',
	clientId: 123,
	color: '#000000',
	browserType: 'chrome',
	isConnected: true,
	isMe: false,
};

describe( 'getPostRestoredNotificationContent', () => {
	it( 'should return formatted message with user name', () => {
		const result = getPostRestoredNotificationContent( baseUserInfo );

		assert.strictEqual( result, 'Alice restored newer content from the server.' );
	} );

	it( 'should omit the name if the user is me', () => {
		const userInfo: UserInfo = {
			...baseUserInfo,
			isMe: true,
		};

		const result = getPostRestoredNotificationContent( userInfo );

		assert.strictEqual( result, 'Restored newer content from the server.' );
	} );
} );

describe( 'getPostUpdatedNotificationContent', () => {
	it( 'should return "Draft" for draft status', () => {
		const result = getPostUpdatedNotificationContent( baseUserInfo, 'draft' );

		assert.strictEqual( result, 'Draft saved by Alice.' );
	} );

	it( 'should return "Draft" for auto-draft status', () => {
		const result = getPostUpdatedNotificationContent( baseUserInfo, 'auto-draft' );

		assert.strictEqual( result, 'Draft saved by Alice.' );
	} );

	it( 'should return "Post" for publish status', () => {
		const result = getPostUpdatedNotificationContent( baseUserInfo, 'publish' );

		assert.strictEqual( result, 'Post updated by Alice.' );
	} );

	it( 'should return "Post" for private status', () => {
		const result = getPostUpdatedNotificationContent( baseUserInfo, 'private' );

		assert.strictEqual( result, 'Post updated by Alice.' );
	} );

	it( 'should return "Post" for future status', () => {
		const result = getPostUpdatedNotificationContent( baseUserInfo, 'future' );

		assert.strictEqual( result, 'Post updated by Alice.' );
	} );

	it( 'should return "Draft" for unknown status', () => {
		const result = getPostUpdatedNotificationContent( baseUserInfo, 'unknown-status' );

		assert.strictEqual( result, 'Draft saved by Alice.' );
	} );
} );

describe( 'getUserPresenceNotificationContent', () => {
	it( 'should return "entered" message for UserEntered type', () => {
		const result = getUserPresenceNotificationContent( baseUserInfo, NotificationType.UserEntered );

		assert.strictEqual( result, 'Alice has entered the post.' );
	} );

	it( 'should return "exited" message for UserExited type', () => {
		const result = getUserPresenceNotificationContent( baseUserInfo, NotificationType.UserExited );

		assert.strictEqual( result, 'Alice has exited the post.' );
	} );

	it( 'should use correct user name in entered message', () => {
		const userState: UserInfo = {
			...baseUserInfo,
			name: 'Bob',
		};

		const result = getUserPresenceNotificationContent( userState, NotificationType.UserEntered );

		assert.strictEqual( result, 'Bob has entered the post.' );
	} );

	it( 'should use correct user name in exited message', () => {
		const userState: UserInfo = {
			...baseUserInfo,
			name: 'Charlie',
		};

		const result = getUserPresenceNotificationContent( userState, NotificationType.UserExited );

		assert.strictEqual( result, 'Charlie has exited the post.' );
	} );
} );
