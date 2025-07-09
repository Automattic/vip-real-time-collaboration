/**
 * Load data from localStorage with error handling
 * @param key - The localStorage key to read from
 * @param defaultValue - The default value to return if loading fails or key doesn't exist
 * @returns The parsed data from localStorage or the default value
 */
export const loadFromLocalStorage = < T >( key: string, defaultValue: T ): T => {
	try {
		const saved = localStorage.getItem( key );
		if ( saved ) {
			return { ...defaultValue, ...( JSON.parse( saved ) as Partial< T > ) };
		}
	} catch ( error ) {
		console.warn( `Failed to load data from localStorage (key: ${ key }):`, error );
	}
	return defaultValue;
};

/**
 * Save data to localStorage with error handling
 * @param key - The localStorage key to write to
 * @param data - The data to save
 */
export const saveToLocalStorage = < T >( key: string, data: T ): void => {
	try {
		localStorage.setItem( key, JSON.stringify( data ) );
	} catch ( error ) {
		console.warn( `Failed to save data to localStorage (key: ${ key }):`, error );
	}
};
