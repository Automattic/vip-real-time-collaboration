import { ToggleControl } from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { PluginDocumentSettingPanel } from '@wordpress/editor';

import { store as rtcSettingsStore } from '../store/settings-store';

export function RTCSettingsPanel() {
	const { isEnabled } = useSelect( select => {
		const store = select( rtcSettingsStore );

		return {
			isEnabled: store.isAwarenessOverlayEnabled(),
		};
	}, [] );

	const { setAwarenessOverlayEnabled } = useDispatch( rtcSettingsStore );

	const handleToggle = async ( enabled: boolean ) => {
		await setAwarenessOverlayEnabled( enabled );
	};

	return (
		<PluginDocumentSettingPanel
			name="vip-realtime-collaboration"
			title="Realtime Collaboration"
			className="vip-realtime-collaboration-settings"
		>
			<div>
				<ToggleControl
					label="Enable Awareness Overlay"
					checked={ isEnabled }
					onChange={ ( enabled: boolean ) => {
						void handleToggle( enabled );
					} }
				/>
			</div>
		</PluginDocumentSettingPanel>
	);
}
