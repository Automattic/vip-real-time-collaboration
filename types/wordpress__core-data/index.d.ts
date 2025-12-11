import '@wordpress/core-data';
import { User, EntityRecord } from '@wordpress/core-data';

declare module '@wordpress/core-data' {
	const store: {
		name: string;
	};

	interface CoreDataSelectors {
		getCurrentUser(): User;
		getCollaboratorMode(): 'view' | 'edit';
		getEditedEntityRecord( kind: string, name: string, recordId: string | number ): EntityRecord;
	}

	interface CoreDataStoreActions {
		setCollaboratorMode: ( mode: 'view' | 'edit' ) => void;
	}
}
