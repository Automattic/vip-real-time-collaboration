import { downloadBlob } from '@wordpress/blob';
import { Button } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import safeStringify from 'safe-stringify';

import { AwarenessManager } from '@/awareness-manager';

export function DebugDataExportButton() {
	const handleDownload = () => {
		const clients = AwarenessManager.getYDocClients();
		if ( ! clients ) {
			return;
		}

		const jsonData = safeStringify( Object.fromEntries( clients ), { indentation: 2 } );
		const timestamp = Date.now();
		const filename = `rtc-debug-${ timestamp }.json`;

		downloadBlob( filename, jsonData, 'application/json' );
	};

	return (
		<Button
			variant="secondary"
			onClick={ handleDownload }
			style={ { width: '100%', marginTop: '8px' } }
		>
			{ __( 'Export Debug Data', 'vip-real-time-collaboration' ) }
		</Button>
	);
}
