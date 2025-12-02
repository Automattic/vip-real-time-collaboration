import { downloadBlob } from '@wordpress/blob';
import { Button } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import safeStringify from 'safe-stringify';

import { AwarenessManager } from '@/awareness-manager';

const handleDebugDataDownload = () => {
	const debugData = AwarenessManager.getDebugData();

	if ( ! debugData ) {
		return;
	}

	const jsonData = safeStringify( debugData, { indentation: 2 } );
	const timestamp = Date.now();
	const filename = `rtc-debug-${ timestamp }.json`;

	downloadBlob( filename, jsonData, 'application/json' );
};

export function DebugDataExportButton() {
	return (
		<Button onClick={ handleDebugDataDownload } variant="secondary">
			{ __( 'Export Debug Data', 'vip-real-time-collaboration' ) }
		</Button>
	);
}
