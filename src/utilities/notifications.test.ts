import assert from 'node:assert';
import { afterEach, before, describe, it, mock } from 'node:test';
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

describe( 'notifications', () => {
	let sendNotification: typeof import('./notifications').sendNotification;
	let notificationTypes: typeof import('./notifications').NotificationType;
	let createNoticeMock: any = null;
	let getSettingMock: any = null;

	before( async () => {
		// These modules access browser globals in their top-level scope which makes
		// it impossible to import the `./selection` module in this file's top-level
		// scope. Therefore, we must mock them and then dynamically import the module
		// under test.
		mock.module( '../store/settings-store', {
			namedExports: {
				Setting: {
					AWARENESS_AVATARS: 'Awareness_Avatars',
					AWARENESS_CURSORS: 'Awareness_Cursors',
					DEBUG_TOOLS: 'Debug_Tools',
					SELF_AWARENESS: 'Self_Awareness',
					USER_ENTER_NOTIFICATION: 'User_Enter_Notification',
					USER_EXIT_NOTIFICATION: 'User_Exit_Notification',
				},
				store: 'settings-store',
			},
		} );
		mock.module( '@wordpress/notices', {
			namedExports: {
				store: 'notices-store',
			},
		} );

		createNoticeMock = mock.fn( async () => Promise.resolve() );
		getSettingMock = mock.fn( () => true );

		mock.module( '@wordpress/data', {
			namedExports: {
				dispatch: mock.fn( () => {
					return {
						createNotice: createNoticeMock,
					};
				} ),
				select: () => {
					return {
						getSetting: getSettingMock,
					};
				},
			},
		} );

		// @ts-expect-error: TS2702 Dynamic import -- used to navigate import issues mentioned above.
		const notificationsModule = await import( './notifications' );
		sendNotification = notificationsModule.sendNotification;
		notificationTypes = notificationsModule.NotificationType;
	} );

	afterEach( () => {
		createNoticeMock.mock.resetCalls();
		getSettingMock.mock.resetCalls();
	} );

	describe( 'sendNotification', () => {
		describe( 'PostUpdated notification type', () => {
			it( 'empty status', () => {
				sendNotification( notificationTypes.PostUpdated, baseUserInfo, '' );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ].arguments, [
					'info',
					'Draft saved by Alice.',
					{ id: 'remote-user-post-updated-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'draft status', () => {
				sendNotification( notificationTypes.PostUpdated, baseUserInfo, 'draft' );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ].arguments, [
					'info',
					'Draft saved by Alice.',
					{ id: 'remote-user-post-updated-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'pending status', () => {
				sendNotification( notificationTypes.PostUpdated, baseUserInfo, 'pending' );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ].arguments, [
					'info',
					'Draft saved by Alice.',
					{ id: 'remote-user-post-updated-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'publish status', () => {
				sendNotification( notificationTypes.PostUpdated, baseUserInfo, 'publish' );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ].arguments, [
					'info',
					'Post updated by Alice.',
					{ id: 'remote-user-post-updated-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'future status', () => {
				sendNotification( notificationTypes.PostUpdated, baseUserInfo, 'future' );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ].arguments, [
					'info',
					'Post updated by Alice.',
					{ id: 'remote-user-post-updated-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'private status', () => {
				sendNotification( notificationTypes.PostUpdated, baseUserInfo, 'private' );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ].arguments, [
					'info',
					'Post updated by Alice.',
					{ id: 'remote-user-post-updated-123', isDismissible: false, type: 'snackbar' },
				] );
			} );
		} );

		describe( 'PostRestored notification type', () => {
			it( 'user is not me', () => {
				sendNotification( notificationTypes.PostRestored, baseUserInfo );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ].arguments, [
					'info',
					'Alice restored newer content from the server.',
					{ id: 'remote-user-post-restored-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'user is me', () => {
				const meUserInfo = { ...baseUserInfo, isMe: true };
				sendNotification( notificationTypes.PostRestored, meUserInfo );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ].arguments, [
					'info',
					'Restored newer content from the server.',
					{ id: 'remote-user-post-restored-123', isDismissible: false, type: 'snackbar' },
				] );
			} );
		} );

		describe( 'UserEntered notification type', () => {
			it( 'notification enabled and user is not me', () => {
				getSettingMock.mock.mockImplementationOnce( () => true );
				sendNotification( notificationTypes.UserEntered, baseUserInfo );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ].arguments, [
					'info',
					'Alice has entered the post.',
					{ id: 'remote-user-user-entered-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'notification disabled', () => {
				getSettingMock.mock.mockImplementationOnce( () => false );
				sendNotification( notificationTypes.UserEntered, baseUserInfo );

				assert.strictEqual(
					createNoticeMock.mock.callCount(),
					0,
					'createNotice should not be called'
				);
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					0,
					'createNotice should not be called'
				);
			} );

			it( 'user is me', () => {
				const meUserInfo = { ...baseUserInfo, isMe: true };
				getSettingMock.mock.mockImplementationOnce( () => true );
				sendNotification( notificationTypes.UserEntered, meUserInfo );

				assert.strictEqual(
					createNoticeMock.mock.callCount(),
					0,
					'createNotice should not be called'
				);
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					0,
					'createNotice should not be called'
				);
			} );
		} );

		describe( 'UserExited notification type', () => {
			it( 'notification enabled and user is not me', () => {
				getSettingMock.mock.mockImplementationOnce( () => true );
				sendNotification( notificationTypes.UserExited, baseUserInfo );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ].arguments, [
					'info',
					'Alice has exited the post.',
					{ id: 'remote-user-user-exited-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'notification disabled', () => {
				getSettingMock.mock.mockImplementationOnce( () => false );
				sendNotification( notificationTypes.UserExited, baseUserInfo );

				assert.strictEqual(
					createNoticeMock.mock.callCount(),
					0,
					'createNotice should not be called'
				);
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					0,
					'createNotice should not be called'
				);
			} );

			it( 'user is me', () => {
				const meUserInfo = { ...baseUserInfo, isMe: true };
				getSettingMock.mock.mockImplementationOnce( () => true );
				sendNotification( notificationTypes.UserExited, meUserInfo );

				assert.strictEqual(
					createNoticeMock.mock.callCount(),
					0,
					'createNotice should not be called'
				);
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					0,
					'createNotice should not be called'
				);
			} );
		} );
	} );
} );
