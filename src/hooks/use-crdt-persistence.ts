/**
 * External dependencies
 */
import { select, subscribe } from '@wordpress/data';
import { store as editorStore } from '@wordpress/editor';
import { useEffect, useState } from '@wordpress/element';

import type { SyncProviderWithAwareness } from '@/provider';

interface CrdtPersistenceInput {
	objectId: string;
	objectType: string;
	syncProvider: SyncProviderWithAwareness;
}

export function useCrdtPersistence( { objectId, objectType, syncProvider }: CrdtPersistenceInput ) {
	const [ shouldUpdate, setShouldUpdate ] = useState< boolean >( false );

	useEffect( () => {
		if ( shouldUpdate ) {
			void syncProvider.persistCrdtDoc( objectType, objectId );
		}
	}, [ shouldUpdate ] );

	// Listen for post save events to update the CRDT document.
	subscribe( () => {
		const isSaving = select( editorStore ).isSavingPost();
		const isAutosaving = select( editorStore ).isAutosavingPost();

		setShouldUpdate( isSaving && ! isAutosaving );
	} );
}
