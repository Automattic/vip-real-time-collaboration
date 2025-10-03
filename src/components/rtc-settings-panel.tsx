import {
	Flex,
	FlexItem,
	ToggleControl,
	__experimentalHeading as Heading,
	__experimentalText as Text,
} from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { PluginDocumentSettingPanel, VisualEditorOverlay } from '@wordpress/editor';
import { BlockCanvasCover } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

import { Avatar } from './avatar';
import { Avatars } from './avatars';
import { PostLockedModal } from './post-locked-modal';
import { RTCOverlay } from './rtc-overlay';
import {
	store as rtcSettingsStore,
	SettingsStoreActions,
	type SettingsStoreSelectors,
} from '../store/settings-store';
import { useSortedAwarenessUsers } from '@/hooks/use-sorted-awareness-users';
import { isDevelopment } from '@/utilities/config';

function isIFrameElement( element: HTMLElement ): element is HTMLIFrameElement {
	return element?.tagName === 'IFRAME';
}

export function RTCSettingsPanel() {
	const { isAvatarsEnabled, isCursorsEnabled, isDebugToolsEnabled, isSelfAwarenessEnabled } =
		useSelect<
			SettingsStoreSelectors,
			{
				isAvatarsEnabled: boolean;
				isCursorsEnabled: boolean;
				isDebugToolsEnabled: boolean;
				isSelfAwarenessEnabled: boolean;
			}
		>( select => {
			return {
				isAvatarsEnabled: select( rtcSettingsStore ).isAwarenessAvatarsEnabled(),
				isCursorsEnabled: select( rtcSettingsStore ).isAwarenessCursorsEnabled(),
				isDebugToolsEnabled: select( rtcSettingsStore ).isDebugToolsEnabled(),
				isSelfAwarenessEnabled: select( rtcSettingsStore ).isSelfAwarenessEnabled(),
			};
		} );

	const {
		setAwarenessAvatarsEnabled,
		setAwarenessCursorsEnabled,
		setDebugToolsEnabled,
		setSelfAwarenessEnabled,
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

	return (
		<>
			<VisualEditorOverlay.Fill>{ isAvatarsEnabled && <Avatars /> }</VisualEditorOverlay.Fill>
			<BlockCanvasCover.Fill>
				{ ( { containerElement }: { containerElement: HTMLElement } ) => {
					console.log( 'containerElement', containerElement );
					console.log( 'containerElement?.closest( document )', containerElement?.ownerDocument );
					// if ( isIFrameElement( containerElement ) ) {
					return (
						containerElement && <RTCOverlay iframeDocument={ containerElement?.ownerDocument } />
					);
					// }

					return <RTCOverlay iframeDocument={ null } />;
				} }
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
		</>
	);
}
