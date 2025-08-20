import { store as coreStore } from '@wordpress/core-data';
import { select } from '@wordpress/data';
import { store as editorStore } from '@wordpress/editor';

import type { WordPressUserInfo } from '@/store/awareness-store';

export interface CurrentEntity {
	objectType: string;
	objectId: string;
	entity: {
		kind: string;
		name: string;
		recordId: number;
	};
}

export async function getCurrentEntity(): Promise< CurrentEntity > {
	const { getCurrentPostId, getCurrentPostType } = select( editorStore );
	const postId = getCurrentPostId();
	const postType = getCurrentPostType();

	if ( ! postId || ! postType ) {
		// getCurrentPostId/getCurrentPostType() returns null for a short time after load.
		// In that case, wait and try again.
		await new Promise( resolve => setTimeout( resolve, 100 ) );
		return await getCurrentEntity();
	}

	const { getEntitiesConfig } = select( coreStore );
	const entitiesConfig = getEntitiesConfig( 'postType' ) as {
		name: string;
		syncConfig: { objectType: string };
	}[];

	for ( const config of entitiesConfig ) {
		if ( config.name === postType && config.syncConfig.objectType ) {
			const entity = { kind: 'postType', name: config.name, recordId: postId };

			return {
				objectType: config.syncConfig.objectType,
				objectId: postId.toString(),
				entity,
			};
		}
	}

	console.error( 'getCurrentEntity() failed to find a matching entity config for:', {
		postType,
		postId,
	} );

	return { objectType: '', objectId: '', entity: { kind: '', name: '', recordId: 0 } };
}

export async function getCurrentUserInfo(): Promise< WordPressUserInfo > {
	const { avatar_urls, id, name } = select( coreStore ).getCurrentUser() ?? {};

	if ( ! id ) {
		// getCurrentUser() returns an empty user object for a short time after load.
		// In that case, wait and try again.
		await new Promise( resolve => setTimeout( resolve, 100 ) );
		return await getCurrentUserInfo();
	}

	return { avatar_urls, id, name };
}
