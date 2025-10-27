import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
	getPostRestoredNotificationContent,
	getPostUpdatedNotificationContent,
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
