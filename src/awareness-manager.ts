/**
 * External dependencies
 */
import { removeAwarenessStates as removeAwarenessStatesFromProtocol } from 'y-protocols/awareness';

import type { UserState } from './store/awareness-store';
import type {
	EntityID,
	AwarenessStateChangeCallback,
	AwarenessReadyCallback,
} from '@wordpress/sync';
import type { Awareness } from 'y-protocols/awareness';

interface AwarenessPendingActions {
	readyListeners: AwarenessReadyCallback[];
	stateChangeListeners: [ 'change' | 'update', AwarenessStateChangeCallback ][];
	localState: Map< string, unknown >;
}

interface LocalState {
	userState: UserState;
}

export class AwarenessManager {
	private instances: Map< EntityID, Awareness > = new Map();
	private pendingActions: Map< EntityID, AwarenessPendingActions > = new Map();

	public bootstrap( entityId: EntityID, awareness: Awareness ): void {
		this.instances.set( entityId, awareness );

		const pendingActions = this.pendingActions.get( entityId );

		// Register pending actions
		pendingActions?.readyListeners.forEach( callback => {
			awareness.on( 'ready', callback );
		} );

		pendingActions?.stateChangeListeners.forEach( ( [ eventType, callback ] ) => {
			awareness.on( eventType, callback );
		} );

		// Set pending local state
		Array.from( pendingActions?.localState?.entries() ?? [] ).forEach(
			( [ field, value ]: [ string, unknown ] ) => {
				awareness.setLocalStateField( field, value );
			}
		);

		// Send a ready event
		awareness.emit( 'ready', [] );
	}

	/**
	 * Add a listener for update and change awareness state change events.
	 */
	public addListener(
		entityId: EntityID,
		eventType: 'change' | 'update',
		listener: AwarenessStateChangeCallback
	): void {
		const awarenessInstance = this.instances.get( entityId );

		if ( awarenessInstance !== undefined ) {
			awarenessInstance.on( eventType, listener );
		} else {
			// If we don't have an awareness instance yet, store the listener for later.
			this.getPendingActions( entityId ).stateChangeListeners.push( [ eventType, listener ] );
		}
	}

	/**
	 * Add a listener for awareness ready events.
	 */
	public addOnReadyListener( entityId: EntityID, listener: AwarenessReadyCallback ): void {
		const awarenessInstance = this.instances.get( entityId );

		if ( awarenessInstance !== undefined ) {
			awarenessInstance.on( 'ready', listener );
			// If we already have an awareness instance and it's a ready event, call the listener immediately.
			listener();
		} else {
			// If we don't have an awareness instance yet, store the listener for later.
			this.getPendingActions( entityId ).readyListeners.push( listener );
		}
	}

	/**
	 * Get the states from an awareness document.
	 */
	public getAllStates( entityId: EntityID ): Map< number, LocalState > {
		return (
			( this.instances.get( entityId )?.getStates() as Map< number, LocalState > ) ?? new Map()
		);
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
	 * Get a local state field from an awareness document.
	 */
	public getLocalState< FieldName extends keyof LocalState >(
		entityId: EntityID,
		field: FieldName
	): LocalState[ FieldName ] | null {
		const state = this.instances.get( entityId )?.getLocalState() as LocalState | undefined;

		return state?.[ field ] ?? null; // eslint-disable-line security/detect-object-injection
	}

	/**
	 * Set a local state field on an awareness document.
	 */
	public setLocalState< FieldName extends keyof LocalState >(
		entityId: EntityID,
		field: FieldName,
		value: LocalState[ FieldName ]
	): void {
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
				readyListeners: [],
				stateChangeListeners: [],
				localState: new Map(),
			} );
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.pendingActions.get( entityId )!;
	}
}
