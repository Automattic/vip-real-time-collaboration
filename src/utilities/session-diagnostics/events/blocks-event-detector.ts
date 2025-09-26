import { store as blockEditorStore } from '@wordpress/block-editor';
import { type BlockInstance } from '@wordpress/blocks';
import { subscribe, select } from '@wordpress/data';

import { BaseEventDetector } from './base-event-detector';
import { generateUUID } from '@/utilities/crypto';
import { getCurrentUserInfo } from '@/utilities/entity';

import type { DiagnosticEvent } from '../types';

interface BlockData {
	clientId: string;
	name: string;
	attributes: Record< string, unknown >;
}

export class BlocksEventDetector extends BaseEventDetector {
	private previousBlocks: BlockData[] = [];
	private setupTimeout: NodeJS.Timeout | null = null;
	private isSetupInProgress = false;
	private userInfo: { id: number; name: string } | null = null;

	public async initialize(): Promise< void > {
		if ( this.isSetupInProgress ) {
			return;
		}

		this.isSetupInProgress = true;
		this.userInfo = await getCurrentUserInfo();

		// Use WordPress-native editor ready detection
		let isInitialized = false;

		const editorReadyUnsubscribe = subscribe( () => {
			const coreEditorSelect = select( 'core/editor' ) as {
				isReady?: () => boolean;
			};

			const isReady = coreEditorSelect.isReady?.();

			if ( isReady && ! isInitialized ) {
				isInitialized = true;

				// Capture initial state now that editor is ready
				this.previousBlocks = this.getCurrentBlocks();

				// Set up block change subscription
				this.unsubscribe = subscribe( () => {
					const newBlocks = this.getCurrentBlocks();
					const changes = this.detectBlockChanges( this.previousBlocks, newBlocks );

					if ( changes.length > 0 ) {
						changes.forEach( change => {
							this.createAndEmitEvent( 'blocks_array_changed', change );
						} );
					}

					this.previousBlocks = newBlocks;
				}, blockEditorStore ) as () => void;

				// Stop listening to editor ready changes
				editorReadyUnsubscribe();
				this.isSetupInProgress = false;
			}
		} ) as () => void;

		// Fallback timeout in case isReady() never returns true
		this.setupTimeout = setTimeout( () => {
			if ( ! isInitialized ) {
				editorReadyUnsubscribe();
				this.isSetupInProgress = false;
				this.setupFallbackSubscription();
			}
		}, 10000 );
	}

	private setupFallbackSubscription(): void {
		this.previousBlocks = this.getCurrentBlocks();

		this.unsubscribe = subscribe( () => {
			const newBlocks = this.getCurrentBlocks();
			const changes = this.detectBlockChanges( this.previousBlocks, newBlocks );

			if ( changes.length > 0 ) {
				changes.forEach( change => {
					this.createAndEmitEvent( 'blocks_array_changed', change );
				} );
			}

			this.previousBlocks = newBlocks;
		}, blockEditorStore ) as () => void;
	}

	private createAndEmitEvent( eventName: string, data: Record< string, unknown > ): void {
		if ( ! this.userInfo ) {
			return;
		}

		const now = Date.now();
		const event: DiagnosticEvent = {
			id: generateUUID(),
			timestamp: now,
			timestamp_h: new Date( now ).toISOString(),
			category: 'blocks',
			event_name: eventName,
			data,
			user_id: this.userInfo.id,
			username: this.userInfo.name,
		};

		this.emitEvent( event );
	}

	private getCurrentBlocks(): BlockData[] {
		try {
			const blockEditorSelectors = select( blockEditorStore ) as {
				getBlocks?: () => BlockInstance[];
			};
			const blocks = blockEditorSelectors.getBlocks?.() || [];
			return this.flattenBlocks( blocks );
		} catch ( error ) {
			return [];
		}
	}

	private flattenBlocks( blocks: BlockInstance[] ): BlockData[] {
		const flatBlocks: BlockData[] = [];

		for ( const block of blocks ) {
			flatBlocks.push( {
				clientId: block.clientId,
				name: block.name,
				attributes: block.attributes,
			} );

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

		const prevBlockCount = previousBlocks.length;
		const currentBlockCount = currentBlocks.length;

		if ( prevBlockCount !== currentBlockCount ) {
			if ( currentBlockCount > prevBlockCount ) {
				const addedBlocks = currentBlocks.slice( prevBlockCount );
				changes.push( {
					operation: 'blocks_added',
					blockCount: currentBlockCount,
					added: currentBlockCount - prevBlockCount,
					addedBlockTypes: addedBlocks.map( block => block.name ),
				} );
			} else {
				changes.push( {
					operation: 'blocks_removed',
					blockCount: currentBlockCount,
					removed: prevBlockCount - currentBlockCount,
				} );
			}
		} else if ( currentBlockCount > 0 ) {
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

		for (
			let index = 0;
			index < Math.min( previousBlocks.length, currentBlocks.length );
			index++
		) {
			// eslint-disable-next-line security/detect-object-injection
			const prevBlock = previousBlocks[ index ];
			// eslint-disable-next-line security/detect-object-injection
			const currentBlock = currentBlocks[ index ];

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
		if ( this.setupTimeout ) {
			clearTimeout( this.setupTimeout );
			this.setupTimeout = null;
		}
		if ( this.unsubscribe ) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		this.isSetupInProgress = false;
	}
}
