import {
	Flex,
	FlexItem,
	ToggleControl,
	__experimentalHeading as Heading,
	__experimentalText as Text,
} from '@wordpress/components';
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
import { isDevelopment } from '@/utilities/config';

export function RTCSettingsPanel() {
	const {
		isAvatarsEnabled,
		isCursorsEnabled,
		isDebugToolsEnabled,
		isHighlightsEnabled,
		isSelfAwarenessEnabled,
	} = useSelect<
		SettingsStoreSelectors,
		{
			isAvatarsEnabled: boolean;
			isCursorsEnabled: boolean;
			isDebugToolsEnabled: boolean;
			isHighlightsEnabled: boolean;
			isSelfAwarenessEnabled: boolean;
		}
	>( select => {
		return {
			isAvatarsEnabled: select( rtcSettingsStore ).isAwarenessAvatarsEnabled(),
			isCursorsEnabled: select( rtcSettingsStore ).isAwarenessCursorsEnabled(),
			isDebugToolsEnabled: select( rtcSettingsStore ).isDebugToolsEnabled(),
			isHighlightsEnabled: select( rtcSettingsStore ).isAwarenessHighlightsEnabled(),
			isSelfAwarenessEnabled: select( rtcSettingsStore ).isSelfAwarenessEnabled(),
		};
	} );

	const {
		setAwarenessAvatarsEnabled,
		setAwarenessHighlightsEnabled,
		setAwarenessCursorsEnabled,
		setDebugToolsEnabled,
		setSelfAwarenessEnabled,
	} = useDispatch< SettingsStoreActions >( rtcSettingsStore );

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

	const handleToggleDebugTools = ( enabled: boolean ) => {
		setDebugToolsEnabled( enabled );
	};

	const handleToggleSelfAwareness = ( enabled: boolean ) => {
		setSelfAwarenessEnabled( enabled );
	};

	return (
		<PluginDocumentSettingPanel
			name="vip-real-time-collaboration"
			title="Real-time collaboration"
			className="vip-real-time-collaboration-settings"
		>
			<div>
				<ToggleControl
					label="Enable avatars"
					checked={ isAvatarsEnabled }
					onChange={ ( enabled: boolean ) => {
						handleToggleAvatars( enabled );
					} }
				/>

				<ToggleControl
					label="Enable highlights"
					checked={ isHighlightsEnabled }
					onChange={ ( enabled: boolean ) => {
						handleToggleHighlights( enabled );
					} }
				/>

				<ToggleControl
					label="Enable cursors"
					checked={ isCursorsEnabled }
					onChange={ ( enabled: boolean ) => {
						handleToggleCursors( enabled );
					} }
				/>

				<ToggleControl
					label="Show my awareness"
					checked={ isSelfAwarenessEnabled }
					onChange={ ( enabled: boolean ) => {
						handleToggleSelfAwareness( enabled );
					} }
				/>

				{ isDevelopment() && (
					<ToggleControl
						label="Show debug tools"
						checked={ isDebugToolsEnabled }
						onChange={ ( enabled: boolean ) => {
							handleToggleDebugTools( enabled );
						} }
					/>
				) }
			</div>

			<Heading level={ 3 } style={ { marginTop: '24px' } }>
				{ __( 'Collaborators', 'vip-real-time-collaboration' ) }
			</Heading>

			<Flex direction="column" className="vip-real-time-collaboration-sidebar-users" gap={ 0 }>
				{ activeUsers.map( userState => (
					<FlexItem key={ userState.clientId }>
						<Flex
							direction="row"
							justify="flex-start"
							className="vip-real-time-collaboration-sidebar-user-row"
						>
							<Avatar
								key={ userState.clientId }
								showUserColorBorder={ true }
								userState={ userState }
							/>
							<Text>{ userState.name }</Text>
						</Flex>
					</FlexItem>
				) ) }
			</Flex>
		</PluginDocumentSettingPanel>
	);
}
