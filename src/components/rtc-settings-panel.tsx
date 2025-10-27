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
import { isDevelopment } from '@/utilities/config';

const { unlock } = __dangerousOptInToUnstableAPIsOnlyForCoreModules(
	'I acknowledge private features are not for use in themes or plugins and doing so will break in the next version of WordPress.',
	'@wordpress/editor'
);

const { EditorPresence } = unlock( editorPrivateApis );

export function RTCSettingsPanel() {
	const {
		isAvatarsEnabled,
		isCursorsEnabled,
		isDebugToolsEnabled,
		isSelfAwarenessEnabled,
		isUserEnterNotificationEnabled,
		isUserExitNotificationEnabled,
	} = useSelect<
		SettingsStoreSelectors,
		{
			isAvatarsEnabled: boolean;
			isCursorsEnabled: boolean;
			isDebugToolsEnabled: boolean;
			isSelfAwarenessEnabled: boolean;
			isUserEnterNotificationEnabled: boolean;
			isUserExitNotificationEnabled: boolean;
		}
	>( select => {
		const { getSetting } = select( rtcSettingsStore );
		return {
			isAvatarsEnabled: getSetting( Setting.AWARENESS_AVATARS ),
			isCursorsEnabled: getSetting( Setting.AWARENESS_CURSORS ),
			isDebugToolsEnabled: getSetting( Setting.DEBUG_TOOLS ),
			isSelfAwarenessEnabled: getSetting( Setting.SELF_AWARENESS ),
			isUserEnterNotificationEnabled: getSetting( Setting.USER_ENTER_NOTIFICATION ),
			isUserExitNotificationEnabled: getSetting( Setting.USER_EXIT_NOTIFICATION ),
		};
	}, [] );

	const { setSetting } = useDispatch< SettingsStoreActions >( rtcSettingsStore );

	const activeUsers = useSortedAwarenessUsers();

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
					<ToggleControl
						label="Enable avatars"
						checked={ isAvatarsEnabled }
						onChange={ ( enabled: boolean ) => setSetting( Setting.AWARENESS_AVATARS, enabled ) }
					/>

					<ToggleControl
						label="Enable cursors"
						checked={ isCursorsEnabled }
						onChange={ ( enabled: boolean ) => setSetting( Setting.AWARENESS_CURSORS, enabled ) }
					/>

					<ToggleControl
						label="Show my awareness"
						checked={ isSelfAwarenessEnabled }
						onChange={ ( enabled: boolean ) => setSetting( Setting.SELF_AWARENESS, enabled ) }
					/>

					{ isDevelopment() && (
						<ToggleControl
							label="Show debug tools"
							checked={ isDebugToolsEnabled }
							onChange={ ( enabled: boolean ) => setSetting( Setting.DEBUG_TOOLS, enabled ) }
						/>
					) }

					<Heading level={ 3 } style={ { marginTop: '24px' } }>
						{ __( 'Notifications', 'vip-real-time-collaboration' ) }
					</Heading>

					<Heading level={ 2 } style={ { marginBottom: '2px' } }>
						{ __( 'Collaborators', 'vip-real-time-collaboration' ) }
					</Heading>

					<ToggleControl
						label="Enters"
						checked={ isUserEnterNotificationEnabled }
						onChange={ ( enabled: boolean ) =>
							setSetting( Setting.USER_ENTER_NOTIFICATION, enabled )
						}
					/>

					<ToggleControl
						label="Exits"
						checked={ isUserExitNotificationEnabled }
						onChange={ ( enabled: boolean ) =>
							setSetting( Setting.USER_EXIT_NOTIFICATION, enabled )
						}
					/>
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
				<div className="vip-telemetry-target"></div>
			</PluginDocumentSettingPanel>
		</>
	);
}
