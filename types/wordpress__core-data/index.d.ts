import '@wordpress/core-data';
import { User } from '@wordpress/core-data';

declare module '@wordpress/core-data' {
	const store: {
		name: string;
	};

	interface CoreDataSelectors {
		getCurrentUser(): User;
		getCollaboratorMode(): 'view' | 'edit';
	}

	interface CoreDataStoreActions {
		setCollaboratorMode: ( mode: 'view' | 'edit' ) => void;
	}
}
