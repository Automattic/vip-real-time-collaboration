/**
 * External dependencies
 */
import { removeAwarenessStates as removeAwarenessStatesFromProtocol } from 'y-protocols/awareness';

import type {
	AwarenessStates,
	EntityID,
	AwarenessStateChangeCallback,
	AwarenessReadyCallback,
} from '@wordpress/sync';
import type { Awareness } from 'y-protocols/awareness';

interface AwarenessPendingActions {
	listeners: (
		| [ 'ready', AwarenessReadyCallback ]
		| [ 'change' | 'update', AwarenessStateChangeCallback ]
	 )[];
	localState: Map< string, unknown >;
}

export class AwarenessManager {
	private instances: Map< EntityID, Awareness > = new Map();
	private pendingActions: Map< EntityID, AwarenessPendingActions > = new Map();

	public bootstrap( entityId: EntityID, awareness: Awareness ): void {
		this.instances.set( entityId, awareness );

		this.pendingActions.get( entityId )?.listeners.forEach( ( [ eventType, callback ] ) => {
			awareness.on( eventType, callback );
		} );

		Array.from( this.pendingActions.get( entityId )?.localState?.entries() ?? [] ).forEach(
			( [ field, value ]: [ string, unknown ] ) => {
				awareness.setLocalStateField( field, value );
			}
		);

		awareness.emit( 'ready', [] );
	}

	/**
	 * Add a listener for awareness events on all awareness documents.
	 */
	public addListener(
		entityId: EntityID,
		eventType: 'ready',
		listener: AwarenessReadyCallback
	): void;
	public addListener(
		entityId: EntityID,
		eventType: 'change' | 'update',
		listener: AwarenessStateChangeCallback
	): void;

	public addListener(
		entityId: EntityID,
		eventType: 'ready' | 'change' | 'update',
		listener: AwarenessReadyCallback | AwarenessStateChangeCallback
	): void {
		const awarenessInstance = this.instances.get( entityId );

		if ( awarenessInstance !== undefined ) {
			awarenessInstance.on( eventType, listener );
		} else if ( eventType === 'ready' ) {
			// If we don't have an awareness instance yet, store the listener for later.
			this.getPendingActions( entityId ).listeners.push( [
				eventType,
				listener as AwarenessReadyCallback,
			] );
		} else {
			this.getPendingActions( entityId ).listeners.push( [
				eventType,
				listener as AwarenessStateChangeCallback,
			] );
		}

		if ( eventType === 'ready' ) {
			// If we already have an awareness instance and it's a ready event, call the listener immediately.
			( listener as AwarenessReadyCallback )();
		}
	}

	/**
	 * Get the states of an awareness document.
	 */
	public getAllStates( entityId: EntityID ): AwarenessStates {
		return this.instances.get( entityId )?.getStates() ?? {};
	}

	/**
	 * Remove the states of an awareness document.
	 */
	public removeAllStates( entityId: EntityID ): void {
		const instance = this.instances.get( entityId );
		if ( instance ) {
			removeAwarenessStatesFromProtocol( instance, [ instance.clientID ], 'removeAwarenessStates' );
		}
	}

	/**
	 * Get the local state from an awareness document.
	 */
	public getLocalStates( entityId: EntityID ): AwarenessStates {
		return this.instances.get( entityId )?.getLocalState() ?? {};
	}

	/**
	 * Get a local state field from all awareness documents.
	 */
	public getLocalState( entityId: EntityID, field?: string ): unknown {
		const state = this.instances.get( entityId )?.getLocalState() ?? {};

		if ( field === undefined ) {
			return state;
		}

		return state[ field ] ?? null; // eslint-disable-line security/detect-object-injection
	}

	/**
	 * Set a local state field on an awareness documents.
	 */
	public setLocalState( entityId: EntityID, field: string, value: unknown ): void {
		if ( ! this.instances.has( entityId ) ) {
			this.getPendingActions( entityId ).localState.set( field, value );
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.instances.get( entityId )!.setLocalStateField( field, value );
	}

	private getPendingActions( entityId: EntityID ): AwarenessPendingActions {
		if ( ! this.pendingActions.has( entityId ) ) {
			this.pendingActions.set( entityId, {
				listeners: [],
				localState: new Map(),
			} );
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.pendingActions.get( entityId )!;
	}
}
