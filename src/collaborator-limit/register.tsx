import { addFilter } from '@wordpress/hooks';
import { registerPlugin } from '@wordpress/plugins';

import { CollaboratorLimitDialog } from './CollaboratorLimitDialog';

const PLUGIN_NAME = 'vip-rtc-collaborator-limit';
const FILTER_NAMESPACE = 'vip-rtc/limit-dialog';
const TARGET_ERROR_CODE = 'connection-limit-exceeded';

addFilter(
	'editor.isSyncConnectionErrorHandled',
	FILTER_NAMESPACE,
	( isHandled: boolean, errorCode: string | undefined ): boolean => {
		if ( errorCode === TARGET_ERROR_CODE ) {
			return true;
		}
		return isHandled;
	}
);

registerPlugin( PLUGIN_NAME, {
	render: CollaboratorLimitDialog,
} );
