/**
 * Meta Sync Manager
 *
 * Manages synchronization of third-party plugin meta fields via Yjs.
 * This enables real-time sync for plugins that don't use core-data.
 */

import { select, subscribe } from '@wordpress/data';

import { Logger } from '@/utilities/logger';

import type { MetaSyncBridge, MetaSyncState } from './types';
import type * as Y from 'yjs';

const META_SYNC_MAP_KEY = 'vip-rtc-meta';

const logger = new Logger( 'meta-sync' );

/**
 * Type for WordPress editor store selectors.
 */
type EditorSelectors = {
	getCurrentPostId: () => number | null;
};

/**
 * The MetaSyncManager coordinates syncing meta between third-party plugins
 * and the Yjs document that's shared between collaborators.
 */
export class MetaSyncManager {
	private readonly bridges: MetaSyncBridge[] = [];
	private activeBridges: MetaSyncBridge[] = [];
	private readonly unsubscribers: Array< () => void > = [];
	private yDoc: Y.Doc | null = null;
	private yMap: Y.Map< unknown > | null = null;
	private isApplyingRemoteChanges = false;
	private postId: string | null = null;

	/**
	 * Register a bridge for a third-party plugin.
	 * Note: Availability is checked at initialization time, not registration time,
	 * because third-party plugin stores may not be loaded when our script runs.
	 */
	public registerBridge( bridge: MetaSyncBridge ): void {
		this.bridges.push( bridge );
		logger.debug( `Registered bridge: ${ bridge.id }` );
	}

	/**
	 * Initialize the meta sync system with a Yjs document.
	 */
	public initialize( doc: Y.Doc, postId: string ): void {
		logger.debug( `Initializing for post ${ postId }`, {
			bridges: this.bridges.map( b => b.id ),
		} );

		if ( this.bridges.length === 0 ) {
			logger.debug( 'No bridges registered, meta sync disabled' );
			return;
		}

		// Filter to only available bridges (third-party stores may now be loaded)
		const availableBridges = this.bridges.filter( bridge => {
			const available = bridge.isAvailable();
			logger.debug( `Bridge "${ bridge.id }" availability: ${ available }` );
			return available;
		} );

		if ( availableBridges.length === 0 ) {
			logger.debug( 'No available bridges after filtering, meta sync disabled' );
			return;
		}

		this.yDoc = doc;
		this.postId = postId;
		this.yMap = doc.getMap< unknown >( META_SYNC_MAP_KEY );

		// Subscribe to remote changes from Yjs
		this.yMap.observe( this.handleYjsChanges.bind( this ) );

		// Subscribe to local changes from each available bridge
		for ( const bridge of availableBridges ) {
			const unsubscribe = bridge.subscribe( this.handleLocalChange.bind( this ) );
			this.unsubscribers.push( unsubscribe );
		}

		// Store available bridges for later use
		this.activeBridges = availableBridges;

		// Sync initial state from bridges to Yjs (if we're the first to connect)
		this.syncInitialState();

		logger.info(
			`Meta sync initialized for post ${ postId } with ${ availableBridges.length } bridges`
		);
	}

	/**
	 * Sync initial state from all active bridges to Yjs.
	 * Only writes values that don't already exist in Yjs.
	 */
	private syncInitialState(): void {
		const yMap = this.yMap;
		const yDoc = this.yDoc;

		if ( ! yMap || ! yDoc ) {
			return;
		}

		yDoc.transact( () => {
			for ( const bridge of this.activeBridges ) {
				for ( const field of bridge.getFields() ) {
					const value = field.getValue();

					// Only set if not already in Yjs (preserves remote state)
					if ( ! yMap.has( field.key ) ) {
						if ( value !== undefined && value !== null && value !== '' ) {
							yMap.set( field.key, value );
							logger.debug( `Initial sync: wrote ${ field.key } to yMap` );
						}
					} else {
						// Apply existing Yjs value to local state
						const remoteValue = yMap.get( field.key );
						if ( remoteValue !== undefined ) {
							this.isApplyingRemoteChanges = true;
							try {
								field.setValue( remoteValue );
								logger.debug( `Applied remote value to local: ${ field.key }` );
							} finally {
								this.isApplyingRemoteChanges = false;
							}
						}
					}
				}
			}
		} );
	}

	/**
	 * Handle changes from Yjs (remote changes from other collaborators).
	 */
	private handleYjsChanges( event: Y.YMapEvent< unknown > ): void {
		// Skip if this change originated from us
		if ( event.transaction.local ) {
			return;
		}

		this.isApplyingRemoteChanges = true;

		try {
			for ( const [ key, change ] of event.changes.keys ) {
				if ( change.action === 'delete' ) {
					continue;
				}

				const value = this.yMap?.get( key );
				logger.debug( `Applying remote value: ${ key }`, { value } );
				this.applyValueToBridges( key, value );
			}
		} finally {
			this.isApplyingRemoteChanges = false;
		}
	}

	/**
	 * Apply a value from Yjs to the appropriate bridge.
	 */
	private applyValueToBridges( key: string, value: unknown ): void {
		for ( const bridge of this.activeBridges ) {
			const field = bridge.getFields().find( f => f.key === key );
			if ( field ) {
				logger.debug( `Applying remote change: ${ key }`, { value } );
				field.setValue( value );
				return;
			}
		}
	}

	/**
	 * Handle local changes from a bridge (user edited something in the plugin).
	 */
	private handleLocalChange( key: string, value: unknown ): void {
		// Skip if we're currently applying remote changes (prevents loops)
		if ( this.isApplyingRemoteChanges ) {
			return;
		}

		if ( ! this.yMap ) {
			return;
		}

		// Check if value actually changed
		const currentValue = this.yMap.get( key );
		if ( currentValue === value ) {
			return;
		}

		logger.debug( `Writing to yMap: ${ key }`, { value } );
		this.yMap.set( key, value );
	}

	/**
	 * Get the current synced state.
	 */
	public getState(): MetaSyncState {
		if ( ! this.yMap ) {
			return {};
		}

		const state: MetaSyncState = {};
		this.yMap.forEach( ( value, key ) => {
			state[ key ] = value;
		} );

		return state;
	}

	/**
	 * Clean up subscriptions and references.
	 */
	public destroy(): void {
		for ( const unsubscribe of this.unsubscribers ) {
			unsubscribe();
		}

		this.unsubscribers.length = 0;
		this.activeBridges = [];
		this.yDoc = null;
		this.yMap = null;
		this.postId = null;

		logger.info( 'Meta sync destroyed' );
	}
}

// Singleton instance
let metaSyncManager: MetaSyncManager | null = null;

/**
 * Get or create the MetaSyncManager singleton.
 */
export function getMetaSyncManager(): MetaSyncManager {
	if ( ! metaSyncManager ) {
		metaSyncManager = new MetaSyncManager();
	}

	return metaSyncManager;
}

/**
 * Initialize meta sync when the editor loads.
 * Call this after registering all bridges.
 */
export function initializeMetaSync(): void {
	// Wait for the editor to be ready and get the Yjs doc
	// We need to store unsubscribe in a mutable variable since we call it from within the callback
	let unsubscribeFn: ( () => void ) | null = null;

	const subscribeCallback = (): void => {
		// Check if we have a current post
		const editorSelect = select( 'core/editor' ) as EditorSelectors;
		const postId = editorSelect.getCurrentPostId();
		if ( ! postId ) {
			return;
		}

		// Get the Yjs doc from WordPress sync
		const wpSync = ( window as { wp?: { sync?: { Y?: unknown } } } ).wp?.sync;
		if ( ! wpSync?.Y ) {
			logger.debug( 'Yjs not available yet' );
			return;
		}

		// We need access to the doc that's being used for sync
		// This is available through the sync providers
		// For now, we'll create our own map within the existing doc structure

		if ( unsubscribeFn ) {
			unsubscribeFn();
		}

		logger.info( 'Editor ready, meta sync will initialize when Yjs doc is available' );
	};

	// Provided type is generic `Function`.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-call
	unsubscribeFn = subscribe( subscribeCallback ) as () => void;
}
