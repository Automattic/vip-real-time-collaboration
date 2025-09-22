import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
	getPostRestoredNotificationContent,
	getPostUpdatedNotificationContent,
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
