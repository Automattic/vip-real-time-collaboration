import { useResizeObserver, useMergeRefs } from '@wordpress/compose';
import { useSelect } from '@wordpress/data';
import { useRef } from '@wordpress/element';

import { Avatars } from '@/components/avatars';
import { DebugTools } from '@/components/debug-tools';
import { PostLockedModal } from '@/components/post-locked-modal';
import { useBlockHighlighting } from '@/hooks/use-block-highlighting';
import { useRenderCursors } from '@/hooks/use-render-cursors';
import { store as rtcSettingsStore, SettingsStoreSelectors } from '@/store/settings-store';
import '@/components/rtc-overlay.scss';

interface RTCOverlayProps {
	iframeDocument: Document;
}

/**
 * This component is responsible for rendering awareness components within the editor iframe.
 */
export function RTCOverlay( { iframeDocument }: RTCOverlayProps ) {
	const overlayRef = useRef< HTMLDivElement >( null );
	const renderCursorsRef = useRef< () => void >();

	const { isAvatarsEnabled, isDebugToolsEnabled } = useSelect<
		SettingsStoreSelectors,
		{ isAvatarsEnabled: boolean; isDebugToolsEnabled: boolean }
	>( select => {
		return {
			isAvatarsEnabled: select( rtcSettingsStore ).isAwarenessAvatarsEnabled(),
			isDebugToolsEnabled: select( rtcSettingsStore ).isDebugToolsEnabled(),
		};
	} );

	// Detect layout changes on overlay (e.g. turning on "Show Template") and window
	// resizes, and re-render the cursors.
	const resizeObserverRef = useResizeObserver( () => {
		renderCursorsRef.current?.();
	} );

	// Merge the refs to use the same element for both overlay and resize observation
	const mergedRef = useMergeRefs( [ overlayRef, resizeObserverRef ] );

	useBlockHighlighting( iframeDocument );
	useRenderCursors( overlayRef, renderCursorsRef, iframeDocument );

	return (
		<>
			{ /* This is a full overlay that covers the entire iframe document.
				Good for scrollable elements like cursor indicators */ }
			<div className="vip-real-time-collaboration-overlay-full" ref={ mergedRef } />

			{ /* This is a fixed overlay that covers the iframe window.
				Good for floating elements like awareness avatars */ }
			<div className="vip-real-time-collaboration-overlay-fixed">
				{ isAvatarsEnabled && <Avatars /> }
				{ isDebugToolsEnabled && <DebugTools iframeDocument={ iframeDocument } /> }
			</div>

			<PostLockedModal />
		</>
	);
}
