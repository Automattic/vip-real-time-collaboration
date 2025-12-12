/**
 * External dependencies
 */
import * as Y from 'yjs';

/**
 * Internal dependencies
 */
import type { AwarenessState } from '@/awareness/awareness-state';
import type { UserInfo } from '@/awareness/awareness-types';

// WordPress user info for debug export (subset of UserInfo)
type DebugUserData = Pick< UserInfo, 'name' | 'email' > & {
	wpUserId: UserInfo[ 'id' ];
};

export interface YDocDebugData {
	doc: Record< string, unknown >;
	clients: Record< number, Array< SerializableYItem > >;
	userMap: Record< string, DebugUserData >;
}

// Type for serializable left/right item references to avoid deep nesting
type SerializableYItemRef = Pick< Y.Item, 'id' | 'length' | 'origin' | 'content' >;

// Serializable Y.Item - only includes data properties with shallow left/right references
type SerializableYItem = Pick<
	Y.Item,
	| 'id'
	| 'length'
	| 'origin'
	| 'rightOrigin'
	| 'parent'
	| 'parentSub'
	| 'redone'
	| 'content'
	| 'info'
> & {
	left: SerializableYItemRef | null;
	right: SerializableYItemRef | null;
};

export function getDebugData( awareness: AwarenessState ): YDocDebugData {
	const ydoc = awareness.doc;

	// Manually extract doc data to avoid deprecated toJSON method
	const docData: Record< string, unknown > = Object.fromEntries(
		Array.from( ydoc.share, ( [ key, value ] ) => [ key, value.toJSON() ] )
	);

	// Build userMap from awareness store (all users seen this session)
	const userMapData = new Map< string, DebugUserData >(
		Array.from( awareness.getSeenStates().entries() ).map( ( [ clientId, userState ] ) => [
			String( clientId ),
			{
				email: userState.userInfo.email,
				name: userState.userInfo.name,
				wpUserId: userState.userInfo.id,
			},
		] )
	);

	// Serialize Yjs client items to avoid deep nesting
	const serializableClientItems: Record< number, Array< SerializableYItem > > = {};

	ydoc.store.clients.forEach( ( structs, clientId ) => {
		// Filter for Y.Item only (skip Y.GC garbage collection structs)
		const items = structs.filter( isYItem );

		// eslint-disable-next-line security/detect-object-injection -- clientId is a number from Yjs, not user input
		serializableClientItems[ clientId ] = items.map( item => {
			const { left, right, ...rest } = item;

			return {
				...rest,
				left: left
					? { id: left.id, length: left.length, origin: left.origin, content: left.content }
					: null,
				right: right
					? { id: right.id, length: right.length, origin: right.origin, content: right.content }
					: null,
			};
		} );
	} );

	return {
		doc: docData,
		clients: serializableClientItems,
		userMap: Object.fromEntries( userMapData ),
	};
}

/**
 * Type guard to check if a struct is a Y.Item (not Y.GC)
 */
function isYItem( struct: Y.Item | Y.GC ): struct is Y.Item {
	return 'content' in struct;
}
