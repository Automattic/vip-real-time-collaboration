import { BaseStorageAdapter } from './base-storage-adapter';
import { SESSION_DIAGNOSTICS_CRDT_KEY } from '../config';

import type { DiagnosticEvent } from '../types';
import type { CRDTDoc } from '@wordpress/sync';

export class CRDTStorageAdapter extends BaseStorageAdapter {
	private currentDoc: CRDTDoc | null = null;
	private cleanupTimer: NodeJS.Timeout | null = null;
	private retentionMs: number;

	constructor( retentionMs: number ) {
		super();
		this.retentionMs = retentionMs;
	}

	public initialize(): void {
		this.startCleanupTimer();
	}

	public setDocument( doc: CRDTDoc | null ): void {
		this.currentDoc = doc;
	}

	public store( event: DiagnosticEvent ): void {
		if ( ! this.currentDoc ) {
			return;
		}

		try {
			this.currentDoc.transact( () => {
				if ( ! this.currentDoc ) {
					return;
				}

				const stateMap = this.currentDoc.getMap( 'state' );
				let diagnostics = stateMap.get( SESSION_DIAGNOSTICS_CRDT_KEY ) as
					| DiagnosticEvent[]
					| undefined;

				if ( ! diagnostics || ! Array.isArray( diagnostics ) ) {
					diagnostics = [];
				}

				diagnostics.unshift( event );

				// Keep only the most recent 100 entries
				if ( diagnostics.length > 100 ) {
					diagnostics = diagnostics.slice( 0, 100 );
				}

				stateMap.set( SESSION_DIAGNOSTICS_CRDT_KEY, diagnostics );
			}, 'session-diagnostics' );
		} catch ( error: unknown ) {
			// Silent fail
		}
	}

	public getEvents(): DiagnosticEvent[] {
		if ( ! this.currentDoc ) {
			return [];
		}

		try {
			const stateMap = this.currentDoc.getMap( 'state' );
			const diagnostics = stateMap.get( SESSION_DIAGNOSTICS_CRDT_KEY ) as DiagnosticEvent[];

			if ( ! Array.isArray( diagnostics ) ) {
				return [];
			}

			return diagnostics;
		} catch ( error: unknown ) {
			return [];
		}
	}

	public cleanup(): void {
		if ( ! this.currentDoc ) {
			return;
		}

		try {
			this.currentDoc.transact( () => {
				if ( ! this.currentDoc ) {
					return;
				}

				const stateMap = this.currentDoc.getMap( 'state' );
				let diagnostics = stateMap.get( SESSION_DIAGNOSTICS_CRDT_KEY ) as DiagnosticEvent[];

				if ( ! Array.isArray( diagnostics ) ) {
					return;
				}

				const cutoffTime = Date.now() - this.retentionMs;
				const originalLength = diagnostics.length;

				diagnostics = diagnostics.filter( entry => entry && entry.timestamp > cutoffTime );

				if ( diagnostics.length !== originalLength ) {
					stateMap.set( SESSION_DIAGNOSTICS_CRDT_KEY, diagnostics );
				}
			} );
		} catch ( error: unknown ) {
			// Silent fail
		}
	}

	private startCleanupTimer(): void {
		if ( this.cleanupTimer ) {
			clearInterval( this.cleanupTimer );
		}

		this.cleanupTimer = setInterval( () => {
			this.cleanup();
		}, 5000 ); // 5 second cleanup interval
	}

	public destroy(): void {
		if ( this.cleanupTimer ) {
			clearInterval( this.cleanupTimer );
			this.cleanupTimer = null;
		}
		this.currentDoc = null;
	}
}
