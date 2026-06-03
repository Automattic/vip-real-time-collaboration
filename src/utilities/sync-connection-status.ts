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
	const coreSelectors = selectFn( 'core' );
	const publicSelectors = ( coreSelectors ?? {} ) as CoreDataSelectorsWithSync;

	// Gutenberg made RTC selectors private in WordPress/gutenberg#78097
	// (a8cc6ce). Older supported versions still expose them publicly.
	try {
		const privateSelectors = unlock< Partial< CoreDataSelectorsWithSync > >( coreSelectors ) ?? {};
		return {
			getPostType: privateSelectors.getPostType ?? publicSelectors.getPostType,
			getSyncConnectionStatus:
				privateSelectors.getSyncConnectionStatus ?? publicSelectors.getSyncConnectionStatus,
		};
	} catch {
		return publicSelectors;
	}
}
