import { store as coreStore, type User } from '@wordpress/core-data';
import { dispatch, select } from '@wordpress/data';
import { addFilter } from '@wordpress/hooks';
import { registerPlugin } from '@wordpress/plugins';
import { type SyncProvider } from '@wordpress/sync';

import { createRTCOverlay } from './components/rtc-overlay';
import { RTCSettingsPanel } from './components/rtc-settings-panel';
import { SelectionType } from './hooks/use-render-cursors';
import { SyncProviderWithAwareness } from './provider';
import { UserState, store as awarenessStore } from './store/awareness-store';
import { getCurrentEntity } from './utilities/entity';
import { getNewUserColor } from './utilities/user-color';
import { createWebSocketConnection, getWebSocketConnectionConfig } from './websocket-client';

type UserStates = Map< number, { userState: UserState } >;

addFilter( 'core.getSyncProvider', 'vip-rtc', ( provider: SyncProvider | null ) => {
	if ( provider ) {
		// If a provider already exists, return it.
		return provider;
	}

	const webSocketConnectionConfig = getWebSocketConnectionConfig();

	// We already error check for the WebSocket URL in the main plugin file,
	// so this is here for safety.
	if ( ! webSocketConnectionConfig.serverUrl ) {
		console.error(
			'VIP Real-Time Collaboration WebSocket URL has not been configured. The plugin will not be functional without it.'
		);
		return null;
	}

	const remoteConnection = createWebSocketConnection( webSocketConnectionConfig );

	const syncProvider = new SyncProviderWithAwareness( null, remoteConnection );

	setTimeout( () => {
		setupAwareness( syncProvider ).catch( error => {
			console.error( 'Error setting up awareness:', error );
		} );
	}, 0 );

	return syncProvider;
} );

registerPlugin( 'vip-real-time-collaboration', {
	render: RTCSettingsPanel,
} );

async function setupAwareness( syncProvider: SyncProviderWithAwareness ) {
	const userInfo = await getCurrentUserInfo();
	const { objectType, objectId } = await getCurrentEntity();
	const { updateUser, removeStateId } = dispatch( awarenessStore );

	syncProvider.addAwarenessListener(
		objectType,
		objectId,
		'change',
		( {
			added,
			updated,
			removed,
		}: {
			added: Array< number >;
			updated: Array< number >;
			removed: Array< number >;
		} ) => {
			const userStates: UserStates = syncProvider.getAllAwarenessStates(
				objectType,
				objectId
			) as UserStates;

			const modifiedUsers = [ ...added, ...updated ];

			const updatePromises = modifiedUsers.map( id => {
				const userState = userStates.get( id )?.userState ?? null;

				if ( userState ) {
					return updateUser( id, userState );
				}

				return Promise.resolve();
			} );

			const removePromises = removed.map( id => {
				return removeStateId( id );
			} );

			( async () => {
				await Promise.all( [ ...updatePromises, ...removePromises ] );
			} )().catch( error => {
				console.error( 'Error updating user states from awareness:', error );
			} );
		}
	);

	syncProvider.onAwarenessReady( objectType, objectId, () => {
		const otherUserColors = select( awarenessStore )
			.getActiveUsers()
			.map( user => user.color );
		const color = getNewUserColor( otherUserColors );

		const userState: UserState = {
			...userInfo,
			color,
			editorState: {
				selection: {
					type: SelectionType.None,
				},
			},
		};

		syncProvider.setLocalAwarenessState( objectType, objectId, 'userState', userState );

		window.addEventListener( 'beforeunload', () => {
			syncProvider.setLocalAwarenessState( objectType, objectId, 'userState', null );
			syncProvider.removeAllAwarenessStates( objectType, objectId );
		} );

		createRTCOverlay( { objectId, objectType, syncProvider } );
	} );
}

async function getCurrentUserInfo(): Promise< User > {
	const currentUser = select( coreStore ).getCurrentUser();

	if ( ! currentUser?.id ) {
		// getCurrentUser() returns an empty user object for a short time after load.
		// In that case, wait and try again.
		await new Promise( resolve => setTimeout( resolve, 100 ) );
		return await getCurrentUserInfo();
	}

	return currentUser;
}
