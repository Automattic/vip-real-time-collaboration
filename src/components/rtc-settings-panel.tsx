import { BlockCanvasCover } from '@wordpress/block-editor';
import { ToggleControl } from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { PluginDocumentSettingPanel } from '@wordpress/editor';
import { store as editorStore, type EditorStoreSelectors } from '@wordpress/editor';
import { useRef } from '@wordpress/element';
import { type ObjectID, type ObjectType } from '@wordpress/sync';

import { DebugTools } from './debug-tools';
import { RTCOverlay } from './rtc-overlay';
import {
	store as rtcSettingsStore,
	Setting,
	SettingsStoreActions,
	type SettingsStoreSelectors,
} from '../store/settings-store';
import { useModifyCodeEditor } from '@/hooks/use-modify-code-editor';
import { isDevelopment } from '@/utilities/config';
import { CursorRegistry } from '@/utilities/cursor-registry';

import '@/components/rtc-settings-panel.scss';

interface SelectResult {
	isCursorsEnabled: boolean;
	isDebugToolsEnabled: boolean;
	objectId?: ObjectID;
	objectType?: ObjectType;
}

export function RTCSettingsPanel() {
	const { isCursorsEnabled, isDebugToolsEnabled } = useSelect<
		SettingsStoreSelectors,
		SelectResult
	>( select => {
		const { getSetting } = select( rtcSettingsStore );

		return {
			isCursorsEnabled: getSetting( Setting.AWARENESS_CURSORS ),
			isDebugToolsEnabled: getSetting( Setting.DEBUG_TOOLS ),
		};
	}, [] );

	const { setSetting } = useDispatch< SettingsStoreActions >( rtcSettingsStore );

	// A single instance of the cursor registry is shared between Avatars and
	// RTCOverlay. A ref is used to persist the instance across re-renders.
	const cursorRegistry = useRef< CursorRegistry >( new CursorRegistry() );

	const postId = useSelect< EditorStoreSelectors, number | null >( select =>
		select( editorStore ).getCurrentPostId()
	);
	const postType = useSelect< EditorStoreSelectors, string | null >( select =>
		select( editorStore ).getCurrentPostType()
	);

	useModifyCodeEditor();

	return (
		<>
			{ BlockCanvasCover && BlockCanvasCover.Fill && (
				<BlockCanvasCover.Fill>
					{ ( {
						containerRef,
					}: {
						containerRef: React.MutableRefObject< HTMLElement | null >;
					} ) => (
						<>
							<RTCOverlay
								blockEditorDocument={ containerRef.current?.ownerDocument }
								cursorRegistry={ cursorRegistry.current }
								postId={ postId }
								postType={ postType }
							/>
							{ isDebugToolsEnabled && containerRef.current?.ownerDocument && (
								<DebugTools iframeDocument={ containerRef.current?.ownerDocument } />
							) }
						</>
					) }
				</BlockCanvasCover.Fill>
			) }
			<PluginDocumentSettingPanel
				name="vip-real-time-collaboration"
				title="Real-time collaboration"
				className="vip-real-time-collaboration-settings"
			>
				<div>
					<ToggleControl
						label="Enable cursors"
						checked={ isCursorsEnabled }
						onChange={ ( enabled: boolean ) => setSetting( Setting.AWARENESS_CURSORS, enabled ) }
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
				</div>
				<div className="vip-telemetry-target"></div>
			</PluginDocumentSettingPanel>
		</>
	);
}
