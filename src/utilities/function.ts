export function memoizeFn< T extends ( ...args: unknown[] ) => unknown >( fn: T ): T {
	const cache = new Map< string, ReturnType< T > >();

	return ( ( ...args: Parameters< T > ) => {
		const key = JSON.stringify( args );
		if ( cache.has( key ) ) {
			return cache.get( key );
		}

		const result = fn( ...args ) as ReturnType< T >;
		cache.set( key, result );
		return result;
	} ) as T;
}
