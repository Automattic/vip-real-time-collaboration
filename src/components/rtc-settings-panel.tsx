import { BlockCanvasCover } from '@wordpress/block-editor';
import {
	Flex,
	FlexItem,
	ToggleControl,
	__experimentalHeading as Heading,
	__experimentalText as Text,
} from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { PluginDocumentSettingPanel, privateApis as editorPrivateApis } from '@wordpress/editor';
import { __ } from '@wordpress/i18n';
import { __dangerousOptInToUnstableAPIsOnlyForCoreModules } from '@wordpress/private-apis';

import { Avatar } from './avatar';
import { Avatars } from './avatars';
import { DebugTools } from './debug-tools';
import { PostLockedModal } from './post-locked-modal';
import { RTCOverlay } from './rtc-overlay';
import {
	store as rtcSettingsStore,
	Setting,
	SettingsStoreActions,
	type SettingsStoreSelectors,
} from '../store/settings-store';
import { useSortedAwarenessUsers } from '@/hooks/use-sorted-awareness-users';
import { getSettingFromConfig, isDevelopment, SettingKey } from '@/utilities/config';

const { unlock } = __dangerousOptInToUnstableAPIsOnlyForCoreModules(
	'I acknowledge private features are not for use in themes or plugins and doing so will break in the next version of WordPress.',
	'@wordpress/editor'
);

const { EditorPresence } = unlock( editorPrivateApis );

export function RTCSettingsPanel() {
	const { isDebugToolsEnabled } = useSelect<
		SettingsStoreSelectors,
		{
			isDebugToolsEnabled: boolean;
		}
	>( select => {
		const { getSetting } = select( rtcSettingsStore );
		return {
			isDebugToolsEnabled: getSetting( Setting.DEBUG_TOOLS ),
		};
	}, [] );

	const { setSetting } = useDispatch< SettingsStoreActions >( rtcSettingsStore );

	const activeUsers = useSortedAwarenessUsers();

	const isAvatarsEnabled = getSettingFromConfig( SettingKey.ENABLE_AWARENESS_AVATARS );

	return (
		<>
			{ isAvatarsEnabled && (
				<EditorPresence>
					<Avatars />
				</EditorPresence>
			) }
			<BlockCanvasCover.Fill>
				{ ( { containerRef }: { containerRef: React.MutableRefObject< HTMLElement | null > } ) => (
					<>
						<RTCOverlay containerRef={ containerRef } />
						{ isDebugToolsEnabled && containerRef.current?.ownerDocument && (
							<DebugTools iframeDocument={ containerRef.current?.ownerDocument } />
						) }
						<PostLockedModal />
					</>
				) }
			</BlockCanvasCover.Fill>
			<PostLockedModal />
			<PluginDocumentSettingPanel
				name="vip-real-time-collaboration"
				title="Real-time collaboration"
				className="vip-real-time-collaboration-settings"
			>
				<div>
					{ isDevelopment() && (
						<ToggleControl
							label="Show debug tools"
							checked={ isDebugToolsEnabled }
							onChange={ ( enabled: boolean ) => setSetting( Setting.DEBUG_TOOLS, enabled ) }
						/>
					) }
				</div>

				<Heading level={ 3 } style={ { marginTop: '24px' } }>
					{ __( 'Collaborators', 'vip-real-time-collaboration' ) }
				</Heading>

				<Flex direction="column" className="vip-real-time-collaboration-sidebar-users" gap={ 0 }>
					{ activeUsers.map( userState => (
						<FlexItem key={ userState.userInfo.clientId }>
							<Flex
								direction="row"
								justify="flex-start"
								className="vip-real-time-collaboration-sidebar-user-row"
							>
								<Avatar
									key={ userState.userInfo.clientId }
									showUserColorBorder={ true }
									userInfo={ userState.userInfo }
								/>
								<Text>{ userState.userInfo.name }</Text>
							</Flex>
						</FlexItem>
					) ) }
				</Flex>
				<div className="vip-telemetry-target"></div>
			</PluginDocumentSettingPanel>
		</>
	);
}
