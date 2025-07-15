import { ToggleControl } from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { PluginDocumentSettingPanel } from '@wordpress/editor';

import {
	store as rtcSettingsStore,
	SettingsStoreActions,
	type SettingsStoreSelectors,
} from '../store/settings-store';

export function RTCSettingsPanel() {
	const isEnabled = useSelect< SettingsStoreSelectors, boolean >( select => {
		return select( rtcSettingsStore ).isAwarenessOverlayEnabled();
	} );

	const { setAwarenessOverlayEnabled } = useDispatch< SettingsStoreActions >( rtcSettingsStore );

	const handleToggle = async ( enabled: boolean ) => {
		setAwarenessOverlayEnabled( enabled );
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
