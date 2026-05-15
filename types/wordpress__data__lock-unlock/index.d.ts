declare module '@wordpress/data/build-module/lock-unlock' {
	export function unlock<T = any>( object: unknown ): T;
}
