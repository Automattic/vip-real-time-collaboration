/**
 * External dependencies
 */
import { WebsocketProvider } from 'y-websocket';
import { addFilter } from '@wordpress/hooks';

/**
 * Internal dependencies
 */

/** @typedef {import('./types').ObjectType} ObjectType */
/** @typedef {import('./types').ObjectID} ObjectID */

/**
 * Function that creates a new WebSocket Connection.
 *
 * @param {Object} config          The object ID.
 * @param {string} config.password
 * @return {import('./types').ConnectDoc} Promise that resolves when the connection is established.
 */
function createWebSocketConnection( { password } ) {
	return function (
		/** @type {string} */ objectId,
		/** @type {string} */ objectType,
		/** @type {import("yjs").Doc} */ doc
	) {
		const roomName = `${ objectType }-${ objectId }`;
		const serverUrl = 'ws://localhost:1234';
		try {
			new WebsocketProvider( serverUrl, roomName, doc, {
				// @ts-ignore
				password,
			} );
		} catch ( err ) {
			// nop
		}
		return Promise.resolve( () => true );
	};
}

// call the wordpress filter to allow plugins to modify the connection provider
addFilter(
	'core.getConnectionProvider',
	'vip-realtime-collaboration/create-websocket-connection',
	password => {
		return createWebSocketConnection( { password } );
	}
);
