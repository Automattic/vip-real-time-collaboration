import { store as coreStore } from '@wordpress/core-data';
import { select } from '@wordpress/data';
import { store as editorStore } from '@wordpress/editor';

export async function getCurrentEntity(): Promise< {
	objectType: string;
	objectId: string;
} > {
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
			return { objectType: config.syncConfig.objectType, objectId: postId.toString() };
		}
	}

	console.error( 'getCurrentEntity() failed to find a matching entity config for:', {
		postType,
		postId,
	} );

	return { objectType: '', objectId: '' };
}
