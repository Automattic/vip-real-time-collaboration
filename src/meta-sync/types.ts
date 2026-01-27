/**
 * Types for the meta sync system.
 */

/**
 * Configuration for a meta field to sync.
 */
export interface MetaSyncField {
	/**
	 * The meta key name (e.g., '_yoast_wpseo_title').
	 */
	key: string;

	/**
	 * Function to get the current value from the third-party plugin.
	 */
	getValue: () => unknown;

	/**
	 * Function to set the value in the third-party plugin.
	 */
	setValue: ( value: unknown ) => void;
}

/**
 * A bridge connects a third-party plugin's state to the meta sync system.
 */
export interface MetaSyncBridge {
	/**
	 * Unique identifier for this bridge (e.g., 'yoast-seo').
	 */
	id: string;

	/**
	 * Check if the third-party plugin is available.
	 */
	isAvailable: () => boolean;

	/**
	 * Get the list of meta fields this bridge handles.
	 */
	getFields: () => MetaSyncField[];

	/**
	 * Subscribe to changes in the third-party plugin's state.
	 * Returns an unsubscribe function.
	 */
	subscribe: ( callback: ( key: string, value: unknown ) => void ) => () => void;
}

/**
 * Meta values stored in the Yjs document.
 */
export type MetaSyncState = Record< string, unknown >;
