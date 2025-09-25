import { store as blockEditorStore } from '@wordpress/block-editor';
import { type BlockInstance } from '@wordpress/blocks';
import { subscribe, select } from '@wordpress/data';

import {
	SESSION_DIAGNOSTICS_CRDT_KEY,
	SESSION_DIAGNOSTICS_CRDT_RETENTION_MS,
	SESSION_DIAGNOSTICS_CLEANUP_INTERVAL_MS,
	SESSION_DIAGNOSTICS_ENABLED,
} from '@/utilities/config';
import { generateUUID } from '@/utilities/crypto';

import type { SessionDiagnosticEvent, SessionDiagnosticsConfig } from '@/types/session-diagnostics';
import type { CRDTDoc } from '@wordpress/sync';

interface BlockData {
	clientId: string;
	name: string;
	attributes: Record< string, unknown >;
}

export class SessionDiagnostics {
	private static instance: SessionDiagnostics | null = null;

	private config: SessionDiagnosticsConfig;
	private cleanupTimer: NodeJS.Timeout | null = null;
	private currentDoc: CRDTDoc | null = null;
	private blockEditorUnsubscribe: ( () => void ) | null = null;
	private previousBlocks: BlockData[] = [];
	private setupTimeout: NodeJS.Timeout | null = null;
	private isSetupInProgress = false;

	private constructor( config?: Partial< SessionDiagnosticsConfig > ) {
		this.config = {
			crdtRetentionMs: SESSION_DIAGNOSTICS_CRDT_RETENTION_MS,
			cleanupIntervalMs: SESSION_DIAGNOSTICS_CLEANUP_INTERVAL_MS,
			enabled: SESSION_DIAGNOSTICS_ENABLED,
			...config,
		};

		this.startCleanupTimer();
	}

	public static getInstance( config?: Partial< SessionDiagnosticsConfig > ): SessionDiagnostics {
		if ( ! SessionDiagnostics.instance ) {
			SessionDiagnostics.instance = new SessionDiagnostics( config );
		}
		return SessionDiagnostics.instance;
	}

	public setCRDTDoc( doc: CRDTDoc | null ): void {
		this.currentDoc = doc;
		console.log( `[SessionDiagnostics] CRDT doc set:`, doc ? 'Available' : 'Null' );

		if ( doc ) {
			// Simple approach: just set up the subscription with proper initial state
			this.setupSimpleBlockSubscription();
		}
	}

	private setupSimpleBlockSubscription(): void {
		console.log( '[SessionDiagnostics] Setting up editor-ready-based block subscription...' );

		// Prevent multiple setup calls
		if ( this.isSetupInProgress ) {
			console.log( '[SessionDiagnostics] Setup already in progress, ignoring duplicate call' );
			return;
		}

		this.isSetupInProgress = true;

		// Clear any existing setup timeout
		if ( this.setupTimeout ) {
			console.log( '[SessionDiagnostics] Clearing previous setup timeout' );
			clearTimeout( this.setupTimeout );
			this.setupTimeout = null;
		}

		// Unsubscribe from any existing subscription first
		if ( this.blockEditorUnsubscribe ) {
			console.log( '[SessionDiagnostics] Unsubscribing from previous subscription' );
			this.blockEditorUnsubscribe();
			this.blockEditorUnsubscribe = null;
		}

		// Use WordPress-native editor ready detection
		let isInitialized = false;

		const editorReadyUnsubscribe = subscribe( () => {
			const coreEditorSelect = select( 'core/editor' ) as {
				isReady?: () => boolean;
			};

			const isReady = coreEditorSelect.isReady?.();
			console.log( `[SessionDiagnostics] Editor ready check: ${ isReady }` );

			if ( isReady && ! isInitialized ) {
				isInitialized = true;
				console.log( '✅ [SessionDiagnostics] Editor is officially ready!' );

				// Capture initial state now that editor is ready
				this.previousBlocks = this.getCurrentBlocks();
				console.log(
					`[SessionDiagnostics] Initial blocks captured via editor ready: ${ this.previousBlocks.length }`
				);

				// Set up block change subscription
				this.blockEditorUnsubscribe = subscribe( () => {
					const newBlocks = this.getCurrentBlocks();

					const changes = this.detectBlockChanges( this.previousBlocks, newBlocks );

					if ( changes.length > 0 ) {
						console.log( `[SessionDiagnostics] Detected ${ changes.length } changes:`, changes );
						changes.forEach( change => {
							this.log( 'blocks_array_changed', change );
						} );
					}

					this.previousBlocks = newBlocks;
				}, blockEditorStore ) as () => void;

				console.log( '[SessionDiagnostics] Block subscription active' );

				// Stop listening to editor ready changes
				editorReadyUnsubscribe();
				this.isSetupInProgress = false;
			}
		} ) as () => void;

		// Fallback timeout in case isReady() never returns true
		this.setupTimeout = setTimeout( () => {
			if ( ! isInitialized ) {
				console.warn( '[SessionDiagnostics] Editor ready timeout, falling back to direct setup' );
				editorReadyUnsubscribe();
				this.isSetupInProgress = false;
				// Fallback to simple timeout approach
				this.setupFallbackSubscription();
			}
		}, 10000 ); // 10 second fallback
	}

	private setupFallbackSubscription(): void {
		console.log( '[SessionDiagnostics] Setting up fallback subscription...' );
		this.previousBlocks = this.getCurrentBlocks();
		console.log( `[SessionDiagnostics] Fallback baseline: ${ this.previousBlocks.length } blocks` );

		this.blockEditorUnsubscribe = subscribe( () => {
			const newBlocks = this.getCurrentBlocks();
			const changes = this.detectBlockChanges( this.previousBlocks, newBlocks );

			if ( changes.length > 0 ) {
				changes.forEach( change => {
					this.log( 'blocks_array_changed', change );
				} );
			}

			this.previousBlocks = newBlocks;
		}, blockEditorStore ) as () => void;
	}

	public log( eventName: string, data: Record< string, unknown > = {} ): void {
		if ( ! this.config.enabled ) {
			return;
		}

		const now = Date.now();
		const event: SessionDiagnosticEvent = {
			id: generateUUID(),
			timestamp: now,
			timestamp_h: new Date( now ).toISOString(),
			event_name: eventName,
			data,
		};

		this.writeToCRDTState( event );
		console.log( `[SessionDiagnostics] Logged event: ${ JSON.stringify( event ) }` );
	}

	private writeToCRDTState( event: SessionDiagnosticEvent ): void {
		if ( ! this.currentDoc ) {
			console.log( '[SessionDiagnostics] No CRDT doc available for writing' );
			return;
		}

		try {
			console.log( '[SessionDiagnostics] Writing to CRDT state:', event );
			this.currentDoc.transact( () => {
				if ( ! this.currentDoc ) {
					return;
				}

				const stateMap = this.currentDoc.getMap( 'state' );
				console.log( '[SessionDiagnostics] State map:', stateMap );

				let diagnostics = stateMap.get( SESSION_DIAGNOSTICS_CRDT_KEY ) as
					| SessionDiagnosticEvent[]
					| undefined;

				console.log( '[SessionDiagnostics] Existing diagnostics:', diagnostics );

				if ( ! diagnostics || ! Array.isArray( diagnostics ) ) {
					diagnostics = [];
				}

				diagnostics.unshift( event );

				// Keep only the most recent 20 entries
				if ( diagnostics.length > 20 ) {
					diagnostics = diagnostics.slice( 0, 20 );
				}

				stateMap.set( SESSION_DIAGNOSTICS_CRDT_KEY, diagnostics );
				console.log( '[SessionDiagnostics] Updated diagnostics in CRDT:', diagnostics );
			}, 'session-diagnostics' );
		} catch ( error: unknown ) {
			console.warn( '[SessionDiagnostics] Failed to write to CRDT state', error );
		}
	}

	private cleanupCRDTState(): void {
		if ( ! this.currentDoc ) {
			return;
		}

		try {
			this.currentDoc.transact( () => {
				if ( ! this.currentDoc ) {
					return;
				}

				const stateMap = this.currentDoc.getMap( 'state' );
				let diagnostics = stateMap.get( SESSION_DIAGNOSTICS_CRDT_KEY ) as SessionDiagnosticEvent[];

				if ( ! Array.isArray( diagnostics ) ) {
					return;
				}

				const cutoffTime = Date.now() - this.config.crdtRetentionMs;
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
			this.cleanupCRDTState();
		}, this.config.cleanupIntervalMs );
	}

	private getCurrentBlocks(): BlockData[] {
		try {
			// Get all blocks including nested ones - this handles inner blocks automatically
			const blockEditorSelectors = select( blockEditorStore ) as {
				getBlocks?: () => BlockInstance[];
			};
			const blocks = blockEditorSelectors.getBlocks?.() || [];
			return this.flattenBlocks( blocks );
		} catch ( error ) {
			console.warn( '[SessionDiagnostics] Error getting current blocks:', error );
			return [];
		}
	}

	private flattenBlocks( blocks: BlockInstance[] ): BlockData[] {
		const flatBlocks: BlockData[] = [];

		for ( const block of blocks ) {
			// Add the block itself with essential info
			flatBlocks.push( {
				clientId: block.clientId,
				name: block.name,
				attributes: block.attributes,
			} );

			// Recursively add inner blocks
			if ( block.innerBlocks && block.innerBlocks.length > 0 ) {
				flatBlocks.push( ...this.flattenBlocks( block.innerBlocks ) );
			}
		}

		return flatBlocks;
	}

	private detectBlockChanges(
		previousBlocks: BlockData[],
		currentBlocks: BlockData[]
	): Record< string, unknown >[] {
		const changes: Record< string, unknown >[] = [];

		// Simple change detection - compare block counts and types
		const prevBlockCount = previousBlocks.length;
		const currentBlockCount = currentBlocks.length;

		if ( prevBlockCount !== currentBlockCount ) {
			if ( currentBlockCount > prevBlockCount ) {
				// Blocks added
				const addedBlocks = currentBlocks.slice( prevBlockCount );
				changes.push( {
					operation: 'blocks_added',
					blockCount: currentBlockCount,
					added: currentBlockCount - prevBlockCount,
					addedBlockTypes: addedBlocks.map( block => block.name ),
				} );
			} else {
				// Blocks removed
				changes.push( {
					operation: 'blocks_removed',
					blockCount: currentBlockCount,
					removed: prevBlockCount - currentBlockCount,
				} );
			}
		} else if ( currentBlockCount > 0 ) {
			// Same count, check for type changes (paragraph -> heading transformation)
			const typeChanges = this.detectBlockTypeChanges( previousBlocks, currentBlocks );
			if ( typeChanges.length > 0 ) {
				changes.push( ...typeChanges );
			}
		}

		return changes;
	}

	private detectBlockTypeChanges(
		previousBlocks: BlockData[],
		currentBlocks: BlockData[]
	): Record< string, unknown >[] {
		const changes: Record< string, unknown >[] = [];

		for ( let i = 0; i < Math.min( previousBlocks.length, currentBlocks.length ); i++ ) {
			const prevBlock = previousBlocks[ i ];
			const currentBlock = currentBlocks[ i ];

			if ( prevBlock && currentBlock && prevBlock.name !== currentBlock.name ) {
				changes.push( {
					operation: 'block_transformed',
					blockCount: currentBlocks.length,
					from: prevBlock.name,
					to: currentBlock.name,
					blockId: currentBlock.clientId,
				} );
			}
		}

		return changes;
	}

	public destroy(): void {
		if ( this.cleanupTimer ) {
			clearInterval( this.cleanupTimer );
			this.cleanupTimer = null;
		}
		if ( this.setupTimeout ) {
			clearTimeout( this.setupTimeout );
			this.setupTimeout = null;
		}
		if ( this.blockEditorUnsubscribe ) {
			this.blockEditorUnsubscribe();
			this.blockEditorUnsubscribe = null;
		}
		this.isSetupInProgress = false;
		SessionDiagnostics.instance = null;
	}
}

export function getSessionDiagnostics(): SessionDiagnostics {
	return SessionDiagnostics.getInstance();
}
