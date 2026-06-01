import { __dangerousOptInToUnstableAPIsOnlyForCoreModules } from '@wordpress/private-apis';

import type { ConnectionStatus } from '@wordpress/sync';

const PRIVATE_API_CONSENT =
	'I acknowledge private features are not for use in themes or plugins and doing so will break in the next version of WordPress.';

const { unlock } = __dangerousOptInToUnstableAPIsOnlyForCoreModules(
	PRIVATE_API_CONSENT,
	'@wordpress/core-data'
);

export interface CoreDataSelectorsWithSync {
	getPostType?: ( slug: string ) => { slug: string; labels?: { name?: string } } | null;
	getSyncConnectionStatus?: () => ConnectionStatus | null | undefined;
}

export type SelectFunction = ( storeName: string ) => unknown;

export function getCoreDataSelectors( selectFn: SelectFunction ): CoreDataSelectorsWithSync {
	return unlock< CoreDataSelectorsWithSync >( selectFn( 'core' ) );
}
