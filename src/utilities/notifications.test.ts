import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
	getPostRestoredNotificationContent,
	getPostUpdatedNotificationContent,
	getUserPresenceNotificationContent,
	NotificationType,
} from './notifications';

import type { UserState } from '@/store/awareness-store';
import type { SelectionState } from '@/utilities/selection';

const baseUserState: UserState = {
	id: 1,
	name: 'Alice',
	color: '#000000',
	browserType: 'chrome',
	clientId: 1,
	editorState: { selection: {} as SelectionState },
	isConnected: true,
	isMe: false,
};

describe( 'getPostRestoredNotificationContent', () => {
	it( 'should return formatted message with user name', () => {
		const result = getPostRestoredNotificationContent( baseUserState );

		assert.strictEqual( result, 'Alice restored newer content from the server.' );
	} );

	it( 'should omit the name if the user is me', () => {
		const userState: UserState = {
			...baseUserState,
			isMe: true,
		};

		const result = getPostRestoredNotificationContent( userState );

		assert.strictEqual( result, 'Restored newer content from the server.' );
	} );
} );

describe( 'getPostUpdatedNotificationContent', () => {
	it( 'should return "Draft" for draft status', () => {
		const result = getPostUpdatedNotificationContent( baseUserState, 'draft' );

		assert.strictEqual( result, 'Draft saved by Alice.' );
	} );

	it( 'should return "Draft" for auto-draft status', () => {
		const result = getPostUpdatedNotificationContent( baseUserState, 'auto-draft' );

		assert.strictEqual( result, 'Draft saved by Alice.' );
	} );

	it( 'should return "Post" for publish status', () => {
		const result = getPostUpdatedNotificationContent( baseUserState, 'publish' );

		assert.strictEqual( result, 'Post updated by Alice.' );
	} );

	it( 'should return "Post" for private status', () => {
		const result = getPostUpdatedNotificationContent( baseUserState, 'private' );

		assert.strictEqual( result, 'Post updated by Alice.' );
	} );

	it( 'should return "Post" for future status', () => {
		const result = getPostUpdatedNotificationContent( baseUserState, 'future' );

		assert.strictEqual( result, 'Post updated by Alice.' );
	} );

	it( 'should return "Draft" for unknown status', () => {
		const result = getPostUpdatedNotificationContent( baseUserState, 'unknown-status' );

		assert.strictEqual( result, 'Draft saved by Alice.' );
	} );
} );

describe( 'getUserPresenceNotificationContent', () => {
	it( 'should return "entered" message for UserEntered type', () => {
		const result = getUserPresenceNotificationContent(
			baseUserState,
			NotificationType.UserEntered
		);

		assert.strictEqual( result, 'Alice has entered the post.' );
	} );

	it( 'should return "exited" message for UserExited type', () => {
		const result = getUserPresenceNotificationContent( baseUserState, NotificationType.UserExited );

		assert.strictEqual( result, 'Alice has exited the post.' );
	} );

	it( 'should use correct user name in entered message', () => {
		const userState: UserState = {
			...baseUserState,
			name: 'Bob',
		};

		const result = getUserPresenceNotificationContent( userState, NotificationType.UserEntered );

		assert.strictEqual( result, 'Bob has entered the post.' );
	} );

	it( 'should use correct user name in exited message', () => {
		const userState: UserState = {
			...baseUserState,
			name: 'Charlie',
		};

		const result = getUserPresenceNotificationContent( userState, NotificationType.UserExited );

		assert.strictEqual( result, 'Charlie has exited the post.' );
	} );
} );
