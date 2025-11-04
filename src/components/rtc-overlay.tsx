import { useResizeObserver, useMergeRefs } from '@wordpress/compose';
import { useRef, useState, useEffect } from '@wordpress/element';

import { useBlockHighlighting } from '@/hooks/use-block-highlighting';
import { useRenderCursors } from '@/hooks/use-render-cursors';
import { type CursorRegistry } from '@/utilities/cursor-registry';

import '@/components/rtc-overlay.scss';

interface RTCOverlayProps {
	containerRef: React.MutableRefObject< HTMLElement | null >;
	cursorRegistry: CursorRegistry;
}

/**
 * This component is responsible for rendering awareness components within the editor iframe.
 */
export function RTCOverlay( { containerRef, cursorRegistry }: RTCOverlayProps ) {
	const overlayRef = useRef< HTMLDivElement >( null );
	const [ document, setDocument ] = useState< Document | null >( null );

	useEffect( () => {
		const ownerDocument = containerRef.current?.ownerDocument ?? null;
		// Update iframe document on mount, which can happen when switching
		// between iframed and non-iframed editors in preview mode.
		setDocument( ownerDocument );

		if ( ownerDocument ) {
			// Redraw cursors after a short delay to ensure cursors are in the correct position
			// after frame-changing animations (e.g. Desktop -> Tablet view) have completed.
			setTimeout( () => {
				renderCursorsRef.current?.();
			}, 500 );
		}
	}, [] );

	const renderCursorsRef = useRenderCursors( overlayRef, document, cursorRegistry );

	// Detect layout changes on overlay (e.g. turning on "Show Template") and window
	// resizes, and re-render the cursors.
	const resizeObserverRef = useResizeObserver( () => {
		renderCursorsRef.current?.();
	} );

	// Merge the refs to use the same element for both overlay and resize observation
	const mergedRef = useMergeRefs( [ overlayRef, resizeObserverRef ] );

	useBlockHighlighting( document );

	return (
		<>
			{ /* This is a full overlay that covers the entire iframe document.
				Good for scrollable elements like cursor indicators */ }
			<div className="vip-real-time-collaboration-overlay-full" ref={ mergedRef } />
		</>
	);
}
