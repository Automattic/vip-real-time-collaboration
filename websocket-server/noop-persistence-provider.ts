/**
 * WordPress dependencies
 */
import type { CRDTDoc } from '@wordpress/sync';

/**
 * A no-operation persistence provider for Y.js collaborative documents.
 *
 * This provider implements the persistence interface but doesn't actually
 * persist any data to storage. It is mainly to ensure that, the websocket-server
 * ejects documents from memory when there are no active connections.
 */
export class NoopPersistenceProvider {
	/**
	 * Called when a document is bound to the provider.
	 * In a real provider, this would load existing state for the doc from storage.
	 *
	 * @param docName - The name/identifier of the document
	 * @param yDoc - The Y.js CRDT document instance
	 */
	bindState( docName: string, yDoc: CRDTDoc ) {
		// Debugging logging can go here.
	}

	/**
	 * Called when the document state should be persisted.
	 * In a real provider, this would save the document state to storage.
	 *
	 * @param docName - The name/identifier of the document
	 * @param yDoc - The Y.js CRDT document instance
	 * @returns Promise that resolves when the write operation is complete
	 */
	writeState( docName: string, yDoc: CRDTDoc ) {
		// Debugging logging can go here.
		return Promise.resolve();
	}
}
