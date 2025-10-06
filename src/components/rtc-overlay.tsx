import { useResizeObserver, useMergeRefs } from '@wordpress/compose';
import { useRef, useState, useEffect } from '@wordpress/element';

import { useBlockHighlighting } from '@/hooks/use-block-highlighting';
import { useRenderCursors } from '@/hooks/use-render-cursors';

import '@/components/rtc-overlay.scss';
import { MutableRefObject } from 'react';

interface RTCOverlayProps {
	containerRef: MutableRefObject< HTMLElement | null >;
}

/**
 * This component is responsible for rendering awareness components within the editor iframe.
 */
export function RTCOverlay( { containerRef }: RTCOverlayProps ) {
	const overlayRef = useRef< HTMLDivElement >( null );
	const [ iframeDocument, setIframeDocument ] = useState< Document | null >( null );

	useEffect( () => {
		// Update iframe document on mount, which can happen when switching
		// between iframed and non-iframed editors in preview mode.
		setIframeDocument( containerRef.current?.ownerDocument ?? null );
	}, [] );

	const renderCursorsRef = useRenderCursors( overlayRef, iframeDocument );

	// Detect layout changes on overlay (e.g. turning on "Show Template") and window
	// resizes, and re-render the cursors.
	const resizeObserverRef = useResizeObserver( () => {
		renderCursorsRef.current?.();
	} );

	// Merge the refs to use the same element for both overlay and resize observation
	const mergedRef = useMergeRefs( [ overlayRef, resizeObserverRef ] );

	useBlockHighlighting( iframeDocument );

	return (
		<>
			{ /* This is a full overlay that covers the entire iframe document.
				Good for scrollable elements like cursor indicators */ }
			<div className="vip-real-time-collaboration-overlay-full" ref={ mergedRef } />
		</>
	);
}
