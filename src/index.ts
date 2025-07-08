import { store as coreStore, type User } from '@wordpress/core-data';
import { select } from '@wordpress/data';
import domReady from '@wordpress/dom-ready';
import { addFilter } from '@wordpress/hooks';
import {
	getSyncProvider,
	type SyncProvider,
	type ConnectDoc,
	type LocalConnectionCreators,
	type RemoteConnectionCreators,
} from '@wordpress/sync';

type UserStates = Map< number, { user: User } >;

import { getWebSocketUrl } from './utils';

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

async function setupAwareness( awareness: SyncProvider[ 'awareness' ] ) {
	awareness.addListener(
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
			const states: UserStates = awareness.getStates() as UserStates;

			if ( added.length > 0 ) {
				for ( const id of added ) {
					const state = states.get( id );
					if ( state ) {
						if ( state.user ) {
							userJoined( state.user, states );
						}
					}
				}
			} else if ( updated.length > 0 ) {
				for ( const id of updated ) {
					const state = states.get( id );
					if ( state ) {
						console.log( 'Users updated, current users:', getCurrentUsers( states ) );
					}
				}
			} else if ( removed.length > 0 ) {
				userLeft( states );
			}
		}
	);

	const userInfo = await getCurrentUserInfo();
	awareness.setLocalStateField( 'user', userInfo );

	window.addEventListener( 'beforeunload', () => {
		awareness.setLocalStateField( 'user', null );
		awareness.removeAwarenessStates();
	} );
}

async function getCurrentUserInfo(): Promise< User > {
	const currentUser = select( coreStore ).getCurrentUser();

	if ( ! currentUser?.id ) {
		await new Promise( resolve => setTimeout( resolve, 100 ) );
		return await getCurrentUserInfo();
	}

	return currentUser;
}

function userJoined( user: User, states: UserStates ) {
	console.log( `User joined: ${ user.name } (ID ${ user.id })` );
	console.log( 'Current users:', getCurrentUsers( states ) );
}

function userLeft( states: UserStates ) {
	console.log( 'User left, remaining users:', getCurrentUsers( states ) );
}

function getCurrentUsers( states: UserStates ) {
	const users = Array.from( states.values() )
		.map( state => {
			if ( state?.user?.name && state?.user.id ) {
				return state.user;
			}
			return false;
		} )
		.filter( Boolean ) as User[];

	const sortedUsers = users.sort( ( userA, userB ) => userA.id - userB.id );

	if ( sortedUsers.length === 0 ) {
		return 'No users connected';
	}

	return sortedUsers.map( user => `${ user.name } (ID ${ user.id })` ).join( ', ' );
}

domReady( function () {
	const syncProvider: SyncProvider = getSyncProvider();

	( async () => {
		await setupAwareness( syncProvider.awareness );
	} )().catch( error => {
		console.error( 'Error getting awareness:', error );
	} );
} );
