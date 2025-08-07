/**
 * External dependencies
 */
import { removeAwarenessStates as removeAwarenessStatesFromProtocol } from 'y-protocols/awareness';

import type { AwarenessEventListener, AwarenessStates, EntityID } from '@wordpress/sync';
import type { Awareness } from 'y-protocols/awareness';

interface AwarenessPendingActions {
	listeners: [ string, AwarenessEventListener ][];
	localState: Map< string, unknown >;
}

export class AwarenessManager {
	private instances: Map< EntityID, Awareness > = new Map();
	private pendingActions: Map< EntityID, AwarenessPendingActions > = new Map();

	public bootstrap( entityId: EntityID, awareness: Awareness ): void {
		this.instances.set( entityId, awareness );

		this.pendingActions
			.get( entityId )
			?.listeners.forEach( ( [ eventType, listener ]: [ string, AwarenessEventListener ] ) => {
				awareness.on( eventType, listener );
			} );

		Array.from( this.pendingActions.get( entityId )?.localState?.entries() ?? [] ).forEach(
			( [ field, value ]: [ string, unknown ] ) => {
				awareness.setLocalStateField( field, value );
			}
		);
	}

	/**
	 * Add a listener for awareness events on all awareness documents.
	 */
	public addListener(
		entityId: EntityID,
		eventType: 'change' | 'update',
		listener: AwarenessEventListener
	): void {
		if ( ! this.instances.has( entityId ) ) {
			this.getPendingActions( entityId ).listeners.push( [ eventType, listener ] );
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.instances.get( entityId )!.on( eventType, listener );
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
	public getLocalState( entityId: EntityID, field: string ): unknown {
		const state = this.instances.get( entityId )?.getLocalState() ?? {};
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
