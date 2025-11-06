declare module '@wordpress/private-apis' {
	export interface PrivateApis< T > {
		__unstablePrivateApis: T;
	}

	export function __dangerousOptInToUnstableAPIsOnlyForCoreModules(
		message: string,
		moduleName: string
	): {
		unlock< T >( this: void, privateApis: PrivateApis< T > ): T;
	};
}
