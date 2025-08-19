import { store as coreStore, type User } from '@wordpress/core-data';
import { dispatch, select } from '@wordpress/data';
import { addFilter } from '@wordpress/hooks';
import { registerPlugin } from '@wordpress/plugins';

import { createRTCOverlay } from './components/rtc-overlay';
import { RTCSettingsPanel } from './components/rtc-settings-panel';
import { SelectionType } from './hooks/use-render-cursors';
import { SyncProviderWithAwareness } from './provider';
import { UserState, store as awarenessStore } from './store/awareness-store';
import { getCurrentEntity } from './utilities/entity';
import { getNewUserColor } from './utilities/user-color';
import { createWebSocketConnection, getWebSocketConnectionConfig } from './websocket-client';

import type { AwarenessStateChange, SyncProvider } from '@wordpress/sync';

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
	const { removeUser, upsertUser } = dispatch( awarenessStore );

	syncProvider.addAwarenessListener(
		objectType,
		objectId,
		'change',
		( { added, removed, updated }: AwarenessStateChange ) => {
			[ ...added, ...updated ].forEach( id => {
				const userState = syncProvider.getUserStateById( objectType, objectId, id );

				if ( userState ) {
					void upsertUser( id, {
						...userState,
						isConnected: true,
						isMe: userState.id === userInfo.id,
					} );
				}
			} );

			removed.forEach( id => {
				void removeUser( id );
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
			isConnected: false,
			isMe: true,
		};

		syncProvider.setUserState( objectType, objectId, userState );

		window.addEventListener( 'beforeunload', () => {
			syncProvider.resetAwareness( objectType, objectId );
		} );

		createRTCOverlay( { objectId, objectType, syncProvider } );
	} );
}

async function getCurrentUserInfo(): Promise< Pick< User, 'avatar_urls' | 'id' | 'name' > > {
	const { avatar_urls, id, name } = select( coreStore ).getCurrentUser() ?? {};

	if ( ! id ) {
		// getCurrentUser() returns an empty user object for a short time after load.
		// In that case, wait and try again.
		await new Promise( resolve => setTimeout( resolve, 100 ) );
		return await getCurrentUserInfo();
	}

	return { avatar_urls, id, name };
}
