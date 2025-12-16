import { BlockCanvasCover } from '@wordpress/block-editor';
import { ToggleControl, __experimentalHeading as Heading } from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { PluginDocumentSettingPanel, privateApis as editorPrivateApis } from '@wordpress/editor';
import { useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { __dangerousOptInToUnstableAPIsOnlyForCoreModules } from '@wordpress/private-apis';
import { type ObjectID, type ObjectType } from '@wordpress/sync';

import { Avatars } from './avatars';
import { CollaborationModePicker } from './collaboration-mode-picker';
import { DebugDataExportButton } from './debug-data-export-button';
import { DebugTools } from './debug-tools';
import { PostLockedModal } from './post-locked-modal';
import { RTCOverlay } from './rtc-overlay';
import {
	store as rtcSettingsStore,
	Setting,
	SettingsStoreActions,
	type SettingsStoreSelectors,
} from '../store/settings-store';
import { useDisableSidebarInteraction } from '@/hooks/use-disable-sidebar-interaction';
import { isDevelopment } from '@/utilities/config';
import { CursorRegistry } from '@/utilities/cursor-registry';

interface SelectResult {
	isAvatarsEnabled: boolean;
	isCursorsEnabled: boolean;
	isDebugToolsEnabled: boolean;
	isSelfAwarenessEnabled: boolean;
	isPostUpdateNotificationEnabled: boolean;
	isUserEnterNotificationEnabled: boolean;
	isUserExitNotificationEnabled: boolean;
	isCollaborationModePickerEnabled: boolean;
	objectId?: ObjectID;
	objectType?: ObjectType;
}

const { unlock } = __dangerousOptInToUnstableAPIsOnlyForCoreModules(
	'I acknowledge private features are not for use in themes or plugins and doing so will break in the next version of WordPress.',
	'@wordpress/editor'
);

const { EditorPresence, CollaborationMode } = unlock( editorPrivateApis );

export function RTCSettingsPanel() {
	const {
		isAvatarsEnabled,
		isCursorsEnabled,
		isDebugToolsEnabled,
		isSelfAwarenessEnabled,
		isPostUpdateNotificationEnabled,
		isUserEnterNotificationEnabled,
		isUserExitNotificationEnabled,
		isCollaborationModePickerEnabled,
	} = useSelect< SettingsStoreSelectors, SelectResult >( select => {
		const { getSetting } = select( rtcSettingsStore );

		return {
			isAvatarsEnabled: getSetting( Setting.AWARENESS_AVATARS ),
			isCursorsEnabled: getSetting( Setting.AWARENESS_CURSORS ),
			isDebugToolsEnabled: getSetting( Setting.DEBUG_TOOLS ),
			isSelfAwarenessEnabled: getSetting( Setting.SELF_AWARENESS ),
			isPostUpdateNotificationEnabled: getSetting( Setting.POST_UPDATE_NOTIFICATION ),
			isUserEnterNotificationEnabled: getSetting( Setting.USER_ENTER_NOTIFICATION ),
			isUserExitNotificationEnabled: getSetting( Setting.USER_EXIT_NOTIFICATION ),
			isCollaborationModePickerEnabled: getSetting( Setting.COLLABORATION_MODE_PICKER ),
		};
	}, [] );

	const { setSetting } = useDispatch< SettingsStoreActions >( rtcSettingsStore );

	// A single instance of the cursor registry is shared between Avatars and
	// RTCOverlay. A ref is used to persist the instance across re-renders.
	const cursorRegistry = useRef< CursorRegistry >( new CursorRegistry() );

	useDisableSidebarInteraction();

	return (
		<>
			{ isCollaborationModePickerEnabled && (
				<CollaborationMode>
					<CollaborationModePicker />
				</CollaborationMode>
			) }
			{ isAvatarsEnabled && (
				<EditorPresence>
					<Avatars cursorRegistry={ cursorRegistry.current } />
				</EditorPresence>
			) }
			<BlockCanvasCover.Fill>
				{ ( { containerRef }: { containerRef: React.MutableRefObject< HTMLElement | null > } ) => (
					<>
						<RTCOverlay
							blockEditorDocument={ containerRef.current?.ownerDocument ?? null }
							cursorRegistry={ cursorRegistry.current }
						/>
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
						<>
							<ToggleControl
								label="Show debug tools"
								checked={ isDebugToolsEnabled }
								onChange={ ( enabled: boolean ) => setSetting( Setting.DEBUG_TOOLS, enabled ) }
							/>
						</>
					) }

					<Heading level={ 2 } style={ { marginTop: '24px' } }>
						{ __( 'Notifications', 'vip-real-time-collaboration' ) }
					</Heading>

					<Heading level={ 3 } style={ { marginBottom: '2px' } }>
						{ __( 'Post', 'vip-real-time-collaboration' ) }
					</Heading>

					<ToggleControl
						label="Save/Publish"
						checked={ isPostUpdateNotificationEnabled }
						onChange={ ( enabled: boolean ) => {
							setSetting( Setting.POST_UPDATE_NOTIFICATION, enabled );
						} }
					/>

					<Heading level={ 3 } style={ { marginBottom: '2px' } }>
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

					<Heading level={ 3 } style={ { marginTop: '24px' } }>
						{ __( 'Debug', 'vip-real-time-collaboration' ) }
					</Heading>
					<DebugDataExportButton />
				</div>
				<div className="vip-telemetry-target"></div>
			</PluginDocumentSettingPanel>
		</>
	);
}
