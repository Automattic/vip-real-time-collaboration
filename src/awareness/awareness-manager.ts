/**
 * External dependencies
 */
import { type ObjectID, type ObjectType } from '@wordpress/sync';

/**
 * Internal dependencies
 */
import { PostEditorAwarenessState } from '@/awareness/post-editor-awareness-state';
import { getBrowserName } from '@/utilities/browser';
import { getCurrentUserInfo } from '@/utilities/entity';
import { memoizeFn } from '@/utilities/function';
import { Logger } from '@/utilities/logger';
import { getNewUserColor } from '@/utilities/user-color';

import type { AwarenessState } from '@/awareness/awareness-state';
import type { UserInfo, WordPressUserInfo } from '@/awareness/awareness-types';
import type * as Y from 'yjs';

const awarenessInstances: Map< string, AwarenessState > = new Map();
const logger: Logger = new Logger( 'awareness-manager' );
const memoizedGetCurrentUserInfo = memoizeFn( getCurrentUserInfo );

function getAwarenessId( objectType: ObjectType, objectId: ObjectID | null ): string {
	return `${ objectType }:${ objectId }`;
}

function getAwarenessInstance(
	objectType: ObjectType,
	objectId: ObjectID | null
): AwarenessState | undefined {
	return awarenessInstances.get( getAwarenessId( objectType, objectId ) );
}

function getUserInfo( awareness: AwarenessState, wpUser: WordPressUserInfo ): UserInfo {
	const states = awareness.getStates();
	const otherUserColors = Array.from( states.entries() )
		.filter( ( [ clientId, state ] ) => state.userInfo && clientId !== awareness.clientID )
		.map( ( [ _clientId, state ] ) => state.userInfo.color )
		.filter( Boolean );

	return {
		...wpUser,
		browserType: getBrowserName(),
		color: getNewUserColor( otherUserColors ),
		enteredAt: Date.now(),
	};
}

export function getPostEditorAwareness(
	postId: number,
	postType: string
): PostEditorAwarenessState | undefined {
	const objectId: ObjectID = postId.toString();
	const objectType: ObjectType = `postType/${ postType }`;

	const awareness = getAwarenessInstance( objectType, objectId );
	if ( awareness instanceof PostEditorAwarenessState ) {
		return awareness;
	}

	logger.error( 'No post editor awareness instance found', {
		objectType,
		objectId,
	} );
}

export async function createAwareness(
	objectType: ObjectType,
	objectId: ObjectID | null,
	ydoc: Y.Doc
): Promise< AwarenessState | undefined > {
	if ( objectId && objectType.startsWith( 'postType/' ) ) {
		logger.debug( 'Initializing awareness for post', { objectType, objectId } );

		const awareness = new PostEditorAwarenessState( ydoc );
		const userInfo = getUserInfo( awareness, await memoizedGetCurrentUserInfo() );
		awareness.setUp( userInfo );
		awarenessInstances.set( getAwarenessId( objectType, objectId ), awareness );

		return awareness;
	}
}

export function setConnectionStatus(
	objectType: ObjectType,
	objectId: ObjectID | null,
	isConnected: boolean
): void {
	getAwarenessInstance( objectType, objectId )?.setConnectionStatus( isConnected );
}
