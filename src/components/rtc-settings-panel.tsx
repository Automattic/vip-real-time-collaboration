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
import { useOverlayFrame } from '@/hooks/use-frame-overlay';
import { useSortedAwarenessUsers } from '@/hooks/use-sorted-awareness-users';

export function RTCSettingsPanel() {
	const { isAvatarsEnabled, isHighlightsEnabled, isCursorsEnabled } = useSelect<
		SettingsStoreSelectors,
		{ isAvatarsEnabled: boolean; isHighlightsEnabled: boolean; isCursorsEnabled: boolean }
	>( select => {
		return {
			isAvatarsEnabled: select( rtcSettingsStore ).isAwarenessAvatarsEnabled(),
			isHighlightsEnabled: select( rtcSettingsStore ).isAwarenessHighlightsEnabled(),
			isCursorsEnabled: select( rtcSettingsStore ).isAwarenessCursorsEnabled(),
		};
	} );

	const { setAwarenessAvatarsEnabled, setAwarenessHighlightsEnabled, setAwarenessCursorsEnabled } =
		useDispatch< SettingsStoreActions >( rtcSettingsStore );

	// Load the overlay frame to render awareness components.
	useOverlayFrame();

	const activeUsers = useSortedAwarenessUsers();

	const handleToggleAvatars = ( enabled: boolean ) => {
		setAwarenessAvatarsEnabled( enabled );
	};

	const handleToggleHighlights = ( enabled: boolean ) => {
		setAwarenessHighlightsEnabled( enabled );
	};

	const handleToggleCursors = ( enabled: boolean ) => {
		setAwarenessCursorsEnabled( enabled );
	};

	return (
		<PluginDocumentSettingPanel
			name="vip-real-time-collaboration"
			title="Real-Time Collaboration"
			className="vip-real-time-collaboration-settings"
		>
			<div>
				<ToggleControl
					label="Enable Avatars"
					checked={ isAvatarsEnabled }
					onChange={ ( enabled: boolean ) => {
						handleToggleAvatars( enabled );
					} }
				/>

				<ToggleControl
					label="Enable Highlights"
					checked={ isHighlightsEnabled }
					onChange={ ( enabled: boolean ) => {
						handleToggleHighlights( enabled );
					} }
				/>

				<ToggleControl
					label="Enable Cursors"
					checked={ isCursorsEnabled }
					onChange={ ( enabled: boolean ) => {
						handleToggleCursors( enabled );
					} }
				/>
			</div>

			<Text style={ { marginTop: '16px', display: 'block' } }>
				{ __( 'Collaborators', 'vip-real-time-collaboration' ) }
			</Text>

			<Flex direction="column" className="vip-real-time-collaboration-sidebar-users" gap={ 0 }>
				{ activeUsers.map( userState => (
					<FlexItem key={ userState.id }>
						<Flex
							direction="row"
							justify="flex-start"
							className="vip-real-time-collaboration-sidebar-user-row"
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
