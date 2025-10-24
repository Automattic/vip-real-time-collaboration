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
		isNotificationsForCollaboratorJoiningEnabled,
		isNotificationsForCollaboratorLeavingEnabled,
	} = useSelect<
		SettingsStoreSelectors,
		{
			isAvatarsEnabled: boolean;
			isCursorsEnabled: boolean;
			isDebugToolsEnabled: boolean;
			isSelfAwarenessEnabled: boolean;
			isNotificationsForCollaboratorJoiningEnabled: boolean;
			isNotificationsForCollaboratorLeavingEnabled: boolean;
		}
	>( select => {
		return {
			isAvatarsEnabled: select( rtcSettingsStore ).isAwarenessAvatarsEnabled(),
			isCursorsEnabled: select( rtcSettingsStore ).isAwarenessCursorsEnabled(),
			isDebugToolsEnabled: select( rtcSettingsStore ).isDebugToolsEnabled(),
			isSelfAwarenessEnabled: select( rtcSettingsStore ).isSelfAwarenessEnabled(),
			isNotificationsForCollaboratorJoiningEnabled:
				select( rtcSettingsStore ).isNotificationsForCollaboratorJoiningEnabled(),
			isNotificationsForCollaboratorLeavingEnabled:
				select( rtcSettingsStore ).isNotificationsForCollaboratorLeavingEnabled(),
		};
	} );

	const {
		setAwarenessAvatarsEnabled,
		setAwarenessCursorsEnabled,
		setDebugToolsEnabled,
		setSelfAwarenessEnabled,
		setNotificationsForCollaboratorJoiningEnabled,
		setNotificationsForCollaboratorLeavingEnabled,
	} = useDispatch< SettingsStoreActions >( rtcSettingsStore );

	const activeUsers = useSortedAwarenessUsers();

	const handleToggleAvatars = ( enabled: boolean ) => {
		setAwarenessAvatarsEnabled( enabled );
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

	const handleToggleNotificationsForCollaboratorJoining = ( enabled: boolean ) => {
		setNotificationsForCollaboratorJoiningEnabled( enabled );
	};

	const handleToggleNotificationsForCollaboratorLeaving = ( enabled: boolean ) => {
		setNotificationsForCollaboratorLeavingEnabled( enabled );
	};

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
						onChange={ ( enabled: boolean ) => {
							handleToggleAvatars( enabled );
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

					<Heading level={ 3 } style={ { marginTop: '24px' } }>
						{ __( 'Notifications', 'vip-real-time-collaboration' ) }
					</Heading>

					<Heading level={ 2 } style={ { marginBottom: '2px' } }>
						{ __( 'Collaborator', 'vip-real-time-collaboration' ) }
					</Heading>

					<ToggleControl
						label="Joins"
						checked={ isNotificationsForCollaboratorJoiningEnabled }
						onChange={ ( enabled: boolean ) => {
							handleToggleNotificationsForCollaboratorJoining( enabled );
						} }
					/>

					<ToggleControl
						label="Leaves"
						checked={ isNotificationsForCollaboratorLeavingEnabled }
						onChange={ ( enabled: boolean ) => {
							handleToggleNotificationsForCollaboratorLeaving( enabled );
						} }
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
