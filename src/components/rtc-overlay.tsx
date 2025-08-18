import { useSelect } from '@wordpress/data';
import { createRoot, useEffect, useRef } from '@wordpress/element';

import './awareness-avatars.scss';
import { AwarenessAvatars } from './avatars';
import { useWaitForSelector } from '../hooks/use-wait-for-selector';
import { store as rtcSettingsStore, SettingsStoreSelectors } from '../store/settings-store';
import { useBlockHighlighting } from '@/hooks/use-block-highlighting';
import { useCrdtPersistence } from '@/hooks/use-crdt-persistence';
import { useRenderCursors } from '@/hooks/use-render-cursors';
import { SyncProviderWithAwareness } from '@/provider';

interface RTCOverlayInitialProps {
	objectId: string;
	objectType: string;
	syncProvider: SyncProviderWithAwareness;
}

export function createRTCOverlay( props: RTCOverlayInitialProps ) {
	const div = document.createElement( 'div' );
	document.body.appendChild( div );

	const overlayRoot = createRoot( div );
	overlayRoot.render( <RTCOverlayManager { ...props } /> );
}

/**
 * This component is responsible for creating the overlay in the editor iframe, and
 * cleaning up the overlay when the component is unmounted.
 */
function RTCOverlayManager( props: RTCOverlayInitialProps ) {
	const iframeElement = useWaitForSelector< HTMLIFrameElement >( 'iframe[name="editor-canvas"]' );
	const iframeOverlayRootRef = useRef< ReturnType< typeof createRoot > | null >( null );

	useEffect( () => {
		// When the iframe is loaded, set blockEditorDocument for modifying block editor contents.
		if ( iframeElement && iframeElement.contentDocument ) {
			onIframeLoad( iframeElement, () => {
				const editorDocument = iframeElement.contentDocument;

				if ( editorDocument ) {
					// Remove existing overlay, if present
					editorDocument.querySelector( '.vip-real-time-collaboration-overlay' )?.remove();

					// Add new overlay inside the iframe
					const overlayDiv = editorDocument.createElement( 'div' );
					overlayDiv.className = 'vip-real-time-collaboration-overlay';
					editorDocument.body.appendChild( overlayDiv );

					// Create React root for the iframe overlay and render components inside it
					const root = createRoot( overlayDiv );
					iframeOverlayRootRef.current = root;
					root.render( <RTCOverlay { ...props } iframeDocument={ editorDocument } /> );
				}
			} );
		}

		// Cleanup function
		return () => {
			if ( iframeOverlayRootRef.current ) {
				iframeOverlayRootRef.current.unmount();
				iframeOverlayRootRef.current = null;
			}
		};
	}, [ iframeElement, props.syncProvider ] );

	// This component doesn't render anything visible in the main document
	// All rendering happens inside the iframe
	return null;
}

interface RTCOverlayProps extends RTCOverlayInitialProps {
	iframeDocument: Document;
}

/**
 * This component is responsible for rendering awareness components within the editor iframe.
 */
function RTCOverlay( { iframeDocument, objectId, objectType, syncProvider }: RTCOverlayProps ) {
	const overlayRef = useRef< HTMLDivElement | null >( null );

	const isAvatarsEnabled = useSelect< SettingsStoreSelectors, boolean >( select => {
		return select( rtcSettingsStore ).isAwarenessAvatarsEnabled();
	} );

	useBlockHighlighting( iframeDocument );
	useCrdtPersistence( { objectId, objectType, syncProvider } );
	useRenderCursors( overlayRef, iframeDocument, syncProvider );

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
		</>
	);
}

const onIframeLoad = ( iframeElement: HTMLIFrameElement, callback: () => void ) => {
	const iframeDocument = iframeElement.contentDocument;

	if ( iframeDocument?.readyState === 'complete' ) {
		callback();
	} else {
		iframeElement.addEventListener( 'load', () => {
			callback();
		} );
	}
};
