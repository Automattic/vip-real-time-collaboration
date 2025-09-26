import {
	SESSION_DIAGNOSTICS_CRDT_RETENTION_MS,
	SESSION_DIAGNOSTICS_CLEANUP_INTERVAL_MS,
	SESSION_DIAGNOSTICS_ENABLED,
} from './config';
import { BaseEventDetector } from './events/base-event-detector';
import { BlocksEventDetector } from './events/blocks-event-detector';
import { BaseStorageAdapter } from './storage/base-storage-adapter';
import { CRDTStorageAdapter } from './storage/crdt-storage-adapter';

import type { DiagnosticEvent, SessionDiagnosticsConfig } from './types';
import type { CRDTDoc } from '@wordpress/sync';

export class SessionDiagnostics {
	private static instance: SessionDiagnostics | null = null;

	private config: SessionDiagnosticsConfig;
	private eventDetectors: Map< string, BaseEventDetector > = new Map();
	private storageAdapters: Map< string, BaseStorageAdapter > = new Map();

	private constructor( config?: Partial< SessionDiagnosticsConfig > ) {
		this.config = {
			crdtRetentionMs: SESSION_DIAGNOSTICS_CRDT_RETENTION_MS,
			cleanupIntervalMs: SESSION_DIAGNOSTICS_CLEANUP_INTERVAL_MS,
			enabled: SESSION_DIAGNOSTICS_ENABLED,
			...config,
		};

		this.initializeStorageAdapters();
		this.initializeEventDetectors();
	}

	public static getInstance( config?: Partial< SessionDiagnosticsConfig > ): SessionDiagnostics {
		if ( ! SessionDiagnostics.instance ) {
			SessionDiagnostics.instance = new SessionDiagnostics( config );
		}
		return SessionDiagnostics.instance;
	}

	public setCRDTDoc( doc: CRDTDoc | null ): void {
		const crdtAdapter = this.storageAdapters.get( 'crdt' ) as CRDTStorageAdapter;
		if ( crdtAdapter ) {
			crdtAdapter.setDocument( doc );
		}

		// Initialize event detectors when CRDT doc is available
		if ( doc ) {
			this.startEventDetection();
		}
	}

	public getEvents(): DiagnosticEvent[] {
		const crdtAdapter = this.storageAdapters.get( 'crdt' ) as CRDTStorageAdapter;
		return crdtAdapter ? crdtAdapter.getEvents() : [];
	}

	private initializeStorageAdapters(): void {
		// Initialize CRDT storage adapter
		const crdtAdapter = new CRDTStorageAdapter( this.config.crdtRetentionMs );
		crdtAdapter.initialize();
		this.storageAdapters.set( 'crdt', crdtAdapter );
	}

	private initializeEventDetectors(): void {
		// Initialize blocks event detector
		const blocksDetector = new BlocksEventDetector( ( event: DiagnosticEvent ) => {
			this.handleEvent( event );
		} );
		this.eventDetectors.set( 'blocks', blocksDetector );
	}

	private startEventDetection(): void {
		if ( ! this.config.enabled ) {
			return;
		}

		// Start blocks detection
		const blocksDetector = this.eventDetectors.get( 'blocks' ) as BlocksEventDetector;
		if ( blocksDetector ) {
			void blocksDetector.initialize();
		}
	}

	private handleEvent( event: DiagnosticEvent ): void {
		if ( ! this.config.enabled ) {
			return;
		}

		// Store event in all storage adapters
		this.storageAdapters.forEach( adapter => {
			adapter.store( event );
		} );
	}

	public destroy(): void {
		// Destroy all event detectors
		this.eventDetectors.forEach( detector => {
			detector.destroy();
		} );

		// Destroy all storage adapters
		this.storageAdapters.forEach( adapter => {
			adapter.destroy();
		} );

		SessionDiagnostics.instance = null;
	}
}
