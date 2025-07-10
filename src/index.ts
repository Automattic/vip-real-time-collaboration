import { store as coreStore, type User } from '@wordpress/core-data';
import { select, dispatch } from '@wordpress/data';
import domReady from '@wordpress/dom-ready';
import { addFilter } from '@wordpress/hooks';
import { registerPlugin } from '@wordpress/plugins';
import {
	getSyncProvider,
	type SyncProvider,
	type ConnectDoc,
	type LocalConnectionCreators,
	type RemoteConnectionCreators,
} from '@wordpress/sync';

import { createRTCOverlay } from './components/rtc-overlay';
import { RTCSettingsPanel } from './components/rtc-settings-panel';
import { store as awarenessStore } from './store/awareness-store';
import { getWebSocketUrl } from './utils';

type UserStates = Map< number, { user: User } >;

addFilter(
	'core.getSyncProviderLocalConnection',
	'vip-realtime-collaboration',
	( connection: ConnectDoc | null, connectionCreators: LocalConnectionCreators ) => {
		return connection ?? connectionCreators.createIndexedDBConnection();
	}
);

addFilter(
	'core.getSyncProviderRemoteConnection',
	'vip-realtime-collaboration',
	( connection: ConnectDoc | null, connectionCreators: RemoteConnectionCreators ) => {
		if ( connection ) {
			// If a connection already exists, return it.
			return connection;
		}

		// We already error check for the WebSocket URL in the main plugin file,
		// so this is here for safety.
		const serverUrl = getWebSocketUrl();
		// ToDo: Remove this before we go into production.
		// eslint-disable-next-line no-console
		console.log( 'WebSocket URL:', serverUrl );

		if ( ! serverUrl ) {
			// ToDo: Replace this with a proper UI notice.
			// eslint-disable-next-line no-console
			console.error(
				'VIP Realtime Collaboration WebSocket URL has not been configured. The plugin will not be functional without it.'
			);
			return null;
		}

		return connectionCreators.createWebSocketConnection( {
			serverUrl,
		} );
	}
);

registerPlugin( 'vip-realtime-collaboration', {
	render: RTCSettingsPanel,
} );

async function setupAwareness( awareness: SyncProvider[ 'awareness' ] ) {
	const { updateUser, removeUser } = dispatch( awarenessStore );

	awareness.addListener(
		'change',
		async ( {
			added,
			updated,
			removed,
		}: {
			added: Array< number >;
			updated: Array< number >;
			removed: Array< number >;
		} ) => {
			const states: UserStates = awareness.getStates() as UserStates;

			const modifiedUsers = [ ...added, ...updated ];

			const updatePromises = modifiedUsers
				.map( id => {
					const state = states.get( id );
					return state ? updateUser( state.user ) : null;
				} )
				.filter( promise => promise !== null );
			await Promise.all( updatePromises );

			const removePromises = removed
				.map( id => {
					const state = states.get( id );
					return state ? removeUser( state.user ) : null;
				} )
				.filter( promise => promise !== null );
			await Promise.all( removePromises );
		}
	);

	const userInfo = await getCurrentUserInfo();
	awareness.setLocalStateField( 'user', userInfo );

	window.addEventListener( 'beforeunload', () => {
		awareness.setLocalStateField( 'user', null );
		awareness.removeAwarenessStates();
	} );

	createRTCOverlay( awareness );
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

domReady( function () {
	const syncProvider: SyncProvider = getSyncProvider();

	( async () => {
		await setupAwareness( syncProvider.awareness );
	} )().catch( error => {
		console.error( 'Error getting awareness:', error );
	} );
} );
