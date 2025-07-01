import { store as coreStore } from '@wordpress/core-data';
import { select } from '@wordpress/data';
import { addAction, addFilter } from '@wordpress/hooks';
import { removeAwarenessStates } from 'y-protocols/awareness.js';

import { initializeBlockWrapper } from './block-wrapper';

import type * as awarenessProtocol from 'y-protocols/awareness.js';
import type { WebsocketProvider } from 'y-websocket';

interface User {
	id: number;
	name: string;
	url: string;
	description: string;
	link: string;
	slug: string;
	avatar_urls: {
		[ size: string ]: string;
	};
}

type UserStates = Map< number, { user: User } >;

addFilter(
	'core.getSyncProviderRemoteConnection',
	'vip-realtime-collaboration',
	( connection: ConnectDoc | null, connectionCreators: RemoteConnectionCreators ) => {
		if ( connection ) {
			return connection;
		}

		return connectionCreators.createWebSocketConnection( {
			serverUrl: 'ws://localhost:1234',
		} );
	}
);

addAction(
	'rtc.provider.created',
	'vip-realtime-collaboration',
	async (
		provider: WebsocketProvider,
		{ objectType, objectId, roomName }: { objectType: string; objectId: string; roomName: string }
	) => {
		if ( objectType === 'postType/Posts' ) {
			await setupAwareness( provider.awareness );
		}
	}
);

async function setupAwareness( awareness: awarenessProtocol.Awareness ) {
	awareness.on(
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

	initializeBlockWrapper( awareness );

	window.addEventListener( 'beforeunload', () => {
		console.log( 'beforeunload' );
		awareness.setLocalState( null );
		removeAwarenessStates( awareness, [ awareness.clientID ], 'window unload' );
	} );
}

async function getCurrentUserInfo(): Promise< User > {
	const currentUser = await ( select( coreStore ) as any ).getCurrentUser();

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
