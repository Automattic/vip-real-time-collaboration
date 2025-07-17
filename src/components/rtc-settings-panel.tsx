import { ToggleControl, __experimentalText as Text, FlexItem, Flex } from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import { __ } from '@wordpress/i18n';

import { Avatar } from './avatar';
import {
	store as rtcSettingsStore,
	SettingsStoreActions,
	type SettingsStoreSelectors,
} from '../store/settings-store';
import { useSortedAwarenessUsers } from '@/hooks/use-sorted-awareness-users';

export function RTCSettingsPanel() {
	const isEnabled = useSelect< SettingsStoreSelectors, boolean >( select => {
		return select( rtcSettingsStore ).isAwarenessOverlayEnabled();
	} );

	const { setAwarenessOverlayEnabled } = useDispatch< SettingsStoreActions >( rtcSettingsStore );
	const activeUsers = useSortedAwarenessUsers();

	const handleToggle = ( enabled: boolean ) => {
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
					label="Enable Overlay"
					checked={ isEnabled }
					onChange={ ( enabled: boolean ) => {
						void handleToggle( enabled );
					} }
				/>
			</div>

			<Text style={ { marginTop: '16px', display: 'block' } }>
				{ __( 'Collaborators', 'vip-realtime-collaboration' ) }
			</Text>

			<Flex direction="column" className="vip-realtime-collaboration-sidebar-users" gap={ 0 }>
				{ activeUsers.map( userState => (
					<FlexItem key={ userState.id }>
						<Flex
							direction="row"
							justify="flex-start"
							className="vip-realtime-collaboration-sidebar-user-row"
						>
							<Avatar userState={ userState } showUserColorBorder={ true } />
							<Text>{ userState.name }</Text>
						</Flex>
					</FlexItem>
				) ) }
			</Flex>
		</PluginDocumentSettingPanel>
	);
}
