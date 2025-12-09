type ObjectEntries< T extends object > = {
	[ K in keyof T ]: [ K, T[ K ] ];
}[ keyof T ][];

export function getRecordValue< RecordType, Key extends keyof RecordType >(
	obj: unknown,
	key: Key
): RecordType[ Key ] | null {
	if ( 'object' === typeof obj && null !== obj && key in obj ) {
		// eslint-disable-next-line security/detect-object-injection
		return ( obj as RecordType )[ key ];
	}

	return null;
}

export function getTypedEntries< T extends object >( obj: T ): ObjectEntries< T > {
	return Object.entries( obj ) as ObjectEntries< T >;
}

export function getTypedKeys< T extends object >( obj: T ): Array< keyof T > {
	return Object.keys( obj ) as Array< keyof T >;
}

export function areMapsEqual< Key, Value >(
	map1: Map< Key, Value >,
	map2: Map< Key, Value >,
	comparatorFn: ( value1: Value, value2: Value ) => boolean
): boolean {
	if ( map1.size !== map2.size ) {
		return false;
	}

	for ( const [ key, value1 ] of map1.entries() ) {
		if ( ! map2.has( key ) ) {
			return false;
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		if ( ! comparatorFn( value1, map2.get( key )! ) ) {
			return false;
		}
	}

	return true;
}
