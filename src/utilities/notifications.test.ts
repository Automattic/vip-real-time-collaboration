import assert from 'node:assert';
import { afterEach, before, describe, it, mock, type Mock } from 'node:test';

import { Setting } from '@/store/settings-store';

import type { UserInfo } from '@/store/awareness-store';

const baseUserInfo: UserInfo = {
	id: 1,
	name: 'Alice',
	clientId: 123,
	color: '#000000',
	browserType: 'chrome',
	isConnected: true,
	isMe: false,
	email: 'alice@example.com',
	enteredAt: Date.now(),
};

describe( 'notifications', () => {
	let sendNotification: typeof import('./notifications').sendNotification;
	let NotificationType: typeof import('./notifications').NotificationType;

	let createNoticeMock: Mock< () => Promise< void > >;
	let getSettingMock: Mock< () => boolean >;

	before( async () => {
		// These @wordpress modules access browser globals in their top-level scope,
		// which makes it impossible to import the `./notifications` module in this
		// file's top-level scope. Therefore, we must mock these modules and then
		// dynamically import the module under test.
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
		mock.module( '@wordpress/notices' );
		mock.module( '@/store/settings-store', {
			namedExports: {
				Setting,
			},
		} );

		createNoticeMock = mock.fn( async () => Promise.resolve() );
		getSettingMock = mock.fn( () => true );

		// @ts-expect-error: TS2702 Dynamic import -- used to navigate import issues mentioned above.
		const notificationsModule = await import( './notifications' );
		sendNotification = notificationsModule.sendNotification;
		NotificationType = notificationsModule.NotificationType;
	} );

	afterEach( () => {
		createNoticeMock.mock.resetCalls();
		getSettingMock.mock.resetCalls();
	} );

	describe( 'sendNotification', () => {
		describe( 'PostUpdated notification type', () => {
			it( 'empty status', () => {
				sendNotification( NotificationType.PostUpdated, baseUserInfo, '' );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ]?.arguments, [
					'info',
					'Draft saved by Alice.',
					{ id: 'remote-user-post-updated-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'draft status', () => {
				sendNotification( NotificationType.PostUpdated, baseUserInfo, 'draft' );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ]?.arguments, [
					'info',
					'Draft saved by Alice.',
					{ id: 'remote-user-post-updated-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'pending status', () => {
				sendNotification( NotificationType.PostUpdated, baseUserInfo, 'pending' );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ]?.arguments, [
					'info',
					'Draft saved by Alice.',
					{ id: 'remote-user-post-updated-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'publish status', () => {
				sendNotification( NotificationType.PostUpdated, baseUserInfo, 'publish' );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ]?.arguments, [
					'info',
					'Post updated by Alice.',
					{ id: 'remote-user-post-updated-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'future status', () => {
				sendNotification( NotificationType.PostUpdated, baseUserInfo, 'future' );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ]?.arguments, [
					'info',
					'Post updated by Alice.',
					{ id: 'remote-user-post-updated-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'private status', () => {
				sendNotification( NotificationType.PostUpdated, baseUserInfo, 'private' );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ]?.arguments, [
					'info',
					'Post updated by Alice.',
					{ id: 'remote-user-post-updated-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'notification disabled for draft status', () => {
				getSettingMock.mock.mockImplementationOnce( () => false );
				sendNotification( NotificationType.PostUpdated, baseUserInfo, 'draft' );

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

			it( 'notification disabled for publish status', () => {
				getSettingMock.mock.mockImplementationOnce( () => false );
				sendNotification( NotificationType.PostUpdated, baseUserInfo, 'publish' );

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

		describe( 'UserEntered notification type', () => {
			it( 'notification enabled and user is not me', () => {
				getSettingMock.mock.mockImplementationOnce( () => true );
				sendNotification( NotificationType.UserEntered, baseUserInfo );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ]?.arguments, [
					'info',
					'Alice has entered the post.',
					{ id: 'remote-user-user-entered-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'notification disabled', () => {
				getSettingMock.mock.mockImplementationOnce( () => false );
				sendNotification( NotificationType.UserEntered, baseUserInfo );

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
				sendNotification( NotificationType.UserEntered, meUserInfo );

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

			it( 'current user just entered', () => {
				const currentMeUserInfo = { ...baseUserInfo, isMe: true, enteredAt: Date.now() };
				getSettingMock.mock.mockImplementationOnce( () => true );
				sendNotification(
					NotificationType.UserEntered,
					baseUserInfo,
					undefined,
					currentMeUserInfo
				);

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

			it( 'user to send about just entered before current user', () => {
				const currentMeUserInfo = { ...baseUserInfo, isMe: true, enteredAt: Date.now() - 10000 };
				getSettingMock.mock.mockImplementationOnce( () => true );
				sendNotification(
					NotificationType.UserEntered,
					baseUserInfo,
					undefined,
					currentMeUserInfo
				);

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ]?.arguments, [
					'info',
					'Alice has entered the post.',
					{ id: 'remote-user-user-entered-123', isDismissible: false, type: 'snackbar' },
				] );
			} );
		} );

		describe( 'UserExited notification type', () => {
			it( 'notification enabled and user is not me', () => {
				getSettingMock.mock.mockImplementationOnce( () => true );
				sendNotification( NotificationType.UserExited, baseUserInfo );

				assert.strictEqual( createNoticeMock.mock.callCount(), 1, 'createNotice should be called' );
				assert.strictEqual(
					createNoticeMock.mock.calls.length,
					1,
					'createNotice should be called'
				);
				assert.deepStrictEqual( createNoticeMock.mock.calls[ 0 ]?.arguments, [
					'info',
					'Alice has exited the post.',
					{ id: 'remote-user-user-exited-123', isDismissible: false, type: 'snackbar' },
				] );
			} );

			it( 'notification disabled', () => {
				getSettingMock.mock.mockImplementationOnce( () => false );
				sendNotification( NotificationType.UserExited, baseUserInfo );

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
				sendNotification( NotificationType.UserExited, meUserInfo );

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
