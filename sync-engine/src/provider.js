/**
 * WordPress dependencies
 */
import { addAction } from '@wordpress/hooks';

/**
 * External dependencies
 */
// @ts-ignore
import * as Y from 'yjs';
import * as buffer from 'lib0/buffer';

/** @typedef {import('./types').ObjectType} ObjectType */
/** @typedef {import('./types').ObjectID} ObjectID */
/** @typedef {import('./types').ObjectConfig} ObjectConfig */
/** @typedef {import('./types').ConnectDoc} ConnectDoc */
/** @typedef {import('./types').SyncProvider} SyncProvider */

/**
 * Create a sync provider.
 *
 * @param {ConnectDoc | null} connectLocal  Connect the document to a local database.
 * @param {ConnectDoc | null} connectRemote Connect the document to a remote sync connection.
 * @return {SyncProvider} Sync provider.
 */
export const createSyncProvider = ( connectLocal, connectRemote ) => {
	/**
	 * @type {Record<string,ObjectConfig>}
	 */
	const postTypeConfigs = {};

	/**
	 * @todo make sure that this used everwhere correctly and that we remove crdtdoc
	 * @type {Record<string,Record<string,{ ydoc: Y.Doc, prevContentClientId: number, destroy: ()=>void }>>}
	 */
	const docs = {};

	// @ts-ignore
	if ( window.__experimentalEnableHeartbeatSync ) {
		addAction( 'heartbeat.tick', 'y-sync', ( data ) => {
			if ( ! data[ 'y-sync' ] ) {
				return;
			}
			Object.entries( data[ 'y-sync' ] ).forEach(
				( [ objectType, objectDocs ] ) => {
					Object.entries( objectDocs ).forEach(
						( [ objectId, remoteDocDef ] ) => {
							const localDocDef =
								( docs[ objectType ] || {} )[ objectId ] ||
								null;
							if ( localDocDef ) {
								Y.applyUpdateV2(
									localDocDef.ydoc,
									buffer.fromBase64( remoteDocDef.state )
								);
								localDocDef.prevContentClientId =
									remoteDocDef.contentClientId;
							}
						}
					);
				}
			);
		} );

		addAction( 'heartbeat.send', 'y-sync', ( data ) => {
			/**
			 * Maps from postType/postId => contentClientId
			 *
			 * The server checks whether the respective post contains a y:gutenberg comment that uses the
			 * contentClientId. If not, it should return the full yjs state of the updated document.
			 *
			 * @type {Record<string,Record<string, number>>}
			 */
			const docRequests = {};
			Object.entries( docs ).forEach( ( [ objectType, objectDocs ] ) => {
				/**
				 * @type {Record<string, number>}
				 */
				const objectTypeRequests = {};
				docRequests[ objectType ] = objectTypeRequests;
				Object.entries( objectDocs ).forEach(
					( [ objectId, localDocDef ] ) => {
						objectTypeRequests[ objectId ] =
							localDocDef.prevContentClientId;
					}
				);
			} );
			data[ 'y-sync' ] = docRequests;
		} );
	}

	/**
	 * Registers an object type.
	 *
	 * @param {ObjectType}   objectType   Object type to register.
	 * @param {ObjectConfig} objectConfig Object config.
	 */
	function register( objectType, objectConfig ) {
		postTypeConfigs[ objectType ] = objectConfig;
	}

	/**
	 * Fetch data from local database or remote source.
	 *
	 * @param {ObjectType} objectType    Object type to load.
	 * @param {ObjectID}   objectId      Object ID to load.
	 * @param {Function}   handleChanges Callback to call when data changes.
	 */
	async function bootstrap( objectType, objectId, handleChanges ) {
		const doc = new Y.Doc( { meta: new Map() } );

		/**
		 * @type {(_update: Uint8Array, origin: any)=>void}
		 */
		const updateHandler = ( _update, origin ) => {
			if ( origin !== 'gutenberg' ) {
				const data = postTypeConfigs[ objectType ].fromCRDTDoc( doc );
				handleChanges( data );
			}
		};
		doc.on( 'update', updateHandler );

		let destroyLocalConnection = null;

		if ( connectLocal ) {
			// connect to locally saved database.
			destroyLocalConnection = await connectLocal(
				objectId,
				objectType,
				doc
			);
		}

		// Once the database syncing is done, start the remote syncing
		if ( connectRemote ) {
			connectRemote( objectId, objectType, doc );
		}

		docs[ objectType ] = docs[ objectType ] || {};
		docs[ objectType ][ objectId ] = {
			ydoc: doc,
			prevContentClientId: 0,
			destroy: () => {
				destroyLocalConnection?.();
				doc.off( 'update', updateHandler );
				doc.destroy();
				delete docs[ objectType ][ objectId ];
			},
		};

		// @todo do proper typings for fetch api
		/**
		 * @type {any}
		 */
		const loadRemotely = postTypeConfigs[ objectType ].fetch;
		if ( loadRemotely ) {
			const data = await loadRemotely( objectId, true );
			doc.transact( () => {
				postTypeConfigs[ objectType ].applyChangesToDoc( doc, data );
			}, 'gutenberg' );
			return data;
		}
		return null;
	}

	/**
	 * Fetch data from local database or remote source.
	 *
	 * @param {ObjectType} objectType Object type to load.
	 * @param {ObjectID}   objectId   Object ID to load.
	 * @param {any}        data       Updates to make.
	 * @param {any}        origin     The source of change.
	 */
	function update( objectType, objectId, data, origin ) {
		const docDef = docs[ objectType ]?.[ objectId ];
		if ( ! docDef ) {
			throw 'Error doc ' + objectType + ' ' + objectId + ' not found';
		}
		docDef.ydoc.transact( () => {
			postTypeConfigs[ objectType ].applyChangesToDoc(
				docDef.ydoc,
				data
			);
		}, origin );
	}

	/**
	 * Stop updating a document and discard it.
	 *
	 * @param {ObjectType} objectType Object type to load.
	 * @param {ObjectID}   objectId   Object ID to load.
	 */
	async function discard( objectType, objectId ) {
		docs[ objectType ]?.[ objectId ]?.destroy();
	}

	/**
	 * Encode Yjs document as update.
	 *
	 * @param {ObjectType} objectType Object type to load.
	 * @param {ObjectID}   objectId   Object ID to load.
	 */
	function encodeState( objectType, objectId ) {
		const docDef = docs[ objectType ]?.[ objectId ];
		if ( ! docDef ) {
			return null;
		}
		return Y.encodeStateAsUpdateV2( docDef.ydoc );
	}

	return {
		register,
		bootstrap,
		update,
		encodeState,
		discard,
		postTypeConfigs,
	};
};
