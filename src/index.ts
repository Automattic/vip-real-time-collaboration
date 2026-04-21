import { addFilter } from '@wordpress/hooks';
import { registerPlugin } from '@wordpress/plugins';

import { CollaborationLimitModal } from '@/components/collaboration-limit-modal';
import { WEBSOCKET_URL } from '@/utilities/config';
import { Logger } from '@/utilities/logger';
import { createWebSocketConnection } from '@/websocket-client';

addFilter( 'sync.providers', 'vip-rtc', () => {
	// We already error check for the WebSocket URL in the main plugin file,
	// so this is here for safety.
	if ( ! WEBSOCKET_URL ) {
		new Logger().critical(
			'VIP Real-Time Collaboration WebSocket URL has not been configured. The plugin will not be functional without it.'
		);
		return [];
	}

	return [ createWebSocketConnection( WEBSOCKET_URL ) ];
} );

// Suppress Gutenberg's default sync-error modal for:
// - `connection-limit-exceeded` (WebSocket connection limit)
// - `collaborator-limit-exceeded` (Collaborator limit)
// A custom modal with our own UI and copy is shown for these error codes.
const CUSTOM_MODAL_ERROR_CODES = [ 'collaborator-limit-exceeded', 'connection-limit-exceeded' ];
addFilter(
	'editor.isSyncConnectionErrorHandled',
	'vip-rtc/collaboration-limit',
	( isHandled: boolean, errorCode: string | undefined ) =>
		errorCode !== undefined && CUSTOM_MODAL_ERROR_CODES.includes( errorCode ) ? true : isHandled
);

registerPlugin( 'vip-rtc-collaboration-limit-modal', {
	render: CollaborationLimitModal,
} );
