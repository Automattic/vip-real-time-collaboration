import { ToggleControl } from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { PluginDocumentSettingPanel } from '@wordpress/editor';

import {
	store as rtcSettingsStore,
	Setting,
	SettingsStoreActions,
	type SettingsStoreSelectors,
} from '../store/settings-store';
import { isDevelopment } from '@/utilities/config';

import '@/components/rtc-settings-panel.scss';

interface SelectResult {
	isDebugToolsEnabled: boolean;
}

export function RTCSettingsPanel() {
	const { isDebugToolsEnabled } = useSelect< SettingsStoreSelectors, SelectResult >( select => {
		const { getSetting } = select( rtcSettingsStore );

		return {
			isDebugToolsEnabled: getSetting( Setting.DEBUG_TOOLS ),
		};
	}, [] );

	const { setSetting } = useDispatch< SettingsStoreActions >( rtcSettingsStore );

	return (
		<>
			<PluginDocumentSettingPanel
				name="vip-real-time-collaboration"
				title="Real-time collaboration"
				className="vip-real-time-collaboration-settings"
			>
				<div>
					{ isDevelopment() && (
						<>
							<ToggleControl
								label="Show debug tools"
								checked={ isDebugToolsEnabled }
								onChange={ ( enabled: boolean ) => setSetting( Setting.DEBUG_TOOLS, enabled ) }
							/>
						</>
					) }
				</div>
				<div className="vip-telemetry-target"></div>
			</PluginDocumentSettingPanel>
		</>
	);
}
