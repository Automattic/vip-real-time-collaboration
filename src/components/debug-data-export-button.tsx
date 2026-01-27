/**
 * External dependencies
 */
import { downloadBlob } from '@wordpress/blob';
import { Button } from '@wordpress/components';
import { useGetDebugData } from '@wordpress/core-data';
import { __ } from '@wordpress/i18n';
import safeStringify from 'safe-stringify';

export function DebugDataExportButton( {
	postId,
	postType,
}: {
	postId: number | null;
	postType: string | null;
} ) {
	const getDebugData = useGetDebugData( postId, postType );

	function handleDebugDataDownload(): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
