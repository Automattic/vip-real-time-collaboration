import { downloadBlob } from '@wordpress/blob';
import { Button } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import safeStringify from 'safe-stringify';

import { useGetDebugData } from '@/hooks/use-post-editor-awareness-state';

export function DebugDataExportButton() {
	const getDebugData = useGetDebugData();

	function handleDebugDataDownload(): void {
		const debugData = getDebugData();
		const jsonData = safeStringify( debugData, { indentation: 2 } );
		const timestamp = Date.now();
		const filename = `rtc-debug-${ timestamp }.json`;

		downloadBlob( filename, jsonData, 'application/json' );
	}

	return (
		<Button onClick={ handleDebugDataDownload } variant="secondary">
			{ __( 'Export Debug Data', 'vip-real-time-collaboration' ) }
		</Button>
	);
}
