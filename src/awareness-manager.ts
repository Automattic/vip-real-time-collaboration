/**
 * External dependencies
 */
import { removeAwarenessStates as removeAwarenessStatesFromProtocol } from 'y-protocols/awareness';

import type { AwarenessEventListener, AwarenessStates, EntityID } from '@wordpress/sync';
import type { Awareness } from 'y-protocols/awareness';

interface AwarenessActions {
	listeners: [ string, AwarenessEventListener ][];
	localState: Map< string, unknown >;
}

export class AwarenessManager {
	private actions: AwarenessActions = {
		listeners: [],
		localState: new Map< string, unknown >(),
	};
	private instances: Map< EntityID, Awareness > = new Map();

	public bootstrap( entityId: EntityID, awareness: Awareness ): void {
		this.instances.set( entityId, awareness );

		this.actions.listeners.forEach(
			( [ eventType, listener ]: [ string, AwarenessEventListener ] ) => {
				awareness.on( eventType, listener );
			}
		);

		Array.from( this.actions.localState.entries() ).forEach(
			( [ field, value ]: [ string, unknown ] ) => {
				awareness.setLocalStateField( field, value );
			}
		);
	}

	/**
	 * Add a listener for awareness events on all awareness documents.
	 */
	public addListener( eventType: 'change' | 'update', listener: AwarenessEventListener ) {
		Array.from( this.instances.values() ).forEach( awareness => {
			awareness.on( eventType, listener );
		} );

		this.actions.listeners.push( [ eventType, listener ] );
	}

	/**
	 * Get the states of all awareness documents.
	 */
	public getAllLocalState(): AwarenessStates {
		return new Map(
			Array.from( this.instances.values() ).map( awareness => [
				awareness.clientID,
				awareness.getStates(),
			] )
		);
	}

	/**
	 * Removes the states of all awareness documents.
	 */
	public removeAllLocalState(): void {
		Array.from( this.instances.values() ).forEach( awareness => {
			removeAwarenessStatesFromProtocol(
				awareness,
				[ awareness.clientID ],
				'removeAwarenessStates'
			);
		} );
	}

	/**
	 * Set a local state field on all awareness documents.
	 */
	public setLocalState( field: string, value: unknown ) {
		Array.from( this.instances.values() ).forEach( awareness => {
			awareness.setLocalStateField( field, value );
		} );

		this.actions.localState.set( field, value );
	}
}
