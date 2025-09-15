import { createElement, createRoot, useEffect, useRef } from '@wordpress/element';

import { RTCOverlay } from '@/components/rtc-overlay';
import { useDocumentReady } from '@/hooks/use-document-ready';
import { useWaitForSelector } from '@/hooks/use-wait-for-selector';

/**
 * This component is responsible for creating the overlay in the editor iframe, and
 * cleaning up the overlay when the component is unmounted.
 */
export function useOverlayFrame() {
	const iframeElement = useWaitForSelector< HTMLIFrameElement >( 'iframe[name="editor-canvas"]' );
	const iframeOverlayRootRef = useRef< ReturnType< typeof createRoot > | null >( null );

	const editorDocument = iframeElement?.contentDocument;
	const isDocumentReady = useDocumentReady( editorDocument );

	useEffect( () => {
		// When the iframe is loaded, set blockEditorDocument for modifying block editor contents.
		if ( editorDocument && editorDocument.body && isDocumentReady ) {
			// Remove existing overlay, if present
			editorDocument.querySelector( '.vip-real-time-collaboration-overlay' )?.remove();

			// Add new overlay inside the iframe
			const overlayDiv = editorDocument.createElement( 'div' );
			overlayDiv.className = 'vip-real-time-collaboration-overlay';
			editorDocument.body.appendChild( overlayDiv );

			// Create React root for the iframe overlay and render components inside it
			const root = createRoot( overlayDiv );
			iframeOverlayRootRef.current = root;

			// This is not a .tsx file, so we'll use non-JSX syntax here.
			root.render( createElement( RTCOverlay, { iframeDocument: editorDocument } ) );
		}

		// Cleanup function
		return () => {
			if ( iframeOverlayRootRef.current ) {
				iframeOverlayRootRef.current.unmount();
				iframeOverlayRootRef.current = null;
			}
		};
	}, [ editorDocument, isDocumentReady ] );
}
