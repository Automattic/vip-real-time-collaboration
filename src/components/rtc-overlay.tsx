import { useSelect } from '@wordpress/data';
import { useRef } from '@wordpress/element';

import { AwarenessAvatars } from '@/components/avatars';
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
	const overlayRef = useRef< HTMLDivElement | null >( null );

	const isAvatarsEnabled = useSelect< SettingsStoreSelectors, boolean >( select => {
		return select( rtcSettingsStore ).isAwarenessAvatarsEnabled();
	} );

	useBlockHighlighting( iframeDocument );
	useRenderCursors( overlayRef, iframeDocument );

	return (
		<>
			{ /* This is a full overlay that covers the entire iframe document.
				Good for scrollable elements like cursor indicators */ }
			<div className="vip-real-time-collaboration-overlay-full" ref={ overlayRef } />

			{ /* This is a fixed overlay that covers the iframe window.
				Good for floating elements like awareness avatars */ }
			<div className="vip-real-time-collaboration-overlay-fixed">
				{ isAvatarsEnabled && <AwarenessAvatars /> }
			</div>

			<PostLockedModal />
		</>
	);
}
