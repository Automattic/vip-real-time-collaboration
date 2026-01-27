import { useResizeObserver, useMergeRefs } from '@wordpress/compose';
import { useEffect, useRef } from '@wordpress/element';

import { useBlockHighlighting } from '@/hooks/use-block-highlighting';
import { useRenderCursors } from '@/hooks/use-render-cursors';
import { type CursorRegistry } from '@/utilities/cursor-registry';

import '@/components/rtc-overlay.scss';

interface RTCOverlayProps {
	blockEditorDocument?: Document;
	cursorRegistry: CursorRegistry;
	postId: number | null;
	postType: string | null;
}

/**
 * This component is responsible for rendering awareness components within the editor iframe.
 */
export function RTCOverlay( {
	blockEditorDocument,
	cursorRegistry,
	postId,
	postType,
}: RTCOverlayProps ) {
	const overlayRef = useRef< HTMLDivElement >( null );
	const rerenderCursorsAfterDelay = useRenderCursors(
		overlayRef,
		blockEditorDocument ?? null,
		cursorRegistry,
		postId ?? null,
		postType ?? null
	);

	// Detect layout changes on overlay (e.g. turning on "Show Template") and window
	// resizes, and re-render the cursors.
	const resizeObserverRef = useResizeObserver( rerenderCursorsAfterDelay );
	useEffect( rerenderCursorsAfterDelay, [ rerenderCursorsAfterDelay ] );

	// Merge the refs to use the same element for both overlay and resize observation
	const mergedRef = useMergeRefs( [ overlayRef, resizeObserverRef ] );

	useBlockHighlighting( document, postId ?? null, postType ?? null );

	// This is a full overlay that covers the entire iframe document. Good for
	// scrollable elements like cursor indicators.
	return <div className="vip-real-time-collaboration-overlay-full" ref={ mergedRef } />;
}
