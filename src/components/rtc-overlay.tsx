import { useSelect } from '@wordpress/data';
import { createRoot, useEffect, useState } from '@wordpress/element';
import { type SyncProvider } from '@wordpress/sync';

import './awareness-avatars.scss';
import { AwarenessAvatars } from './avatars';
import { usePositionOverlay } from '../hooks/use-position-overlay';
import { useWaitForSelector } from '../hooks/use-wait-for-selector';
import { store as rtcSettingsStore, SettingsStoreSelectors } from '../store/settings-store';
import { useBlockHighlighting } from '@/hooks/use-block-highlighting';
import { useRenderCursors } from '@/hooks/use-render-cursors';

export function createRTCOverlay( awareness: SyncProvider[ 'awareness' ] ) {
	const div = document.createElement( 'div' );
	document.body.appendChild( div );

	const overlayRoot = createRoot( div );
	overlayRoot.render( <RTCOverlay awareness={ awareness } /> );
}

function RTCOverlay( { awareness }: { awareness: SyncProvider[ 'awareness' ] } ) {
	const editorElement = useWaitForSelector( '.editor-visual-editor' );
	const iframeElement = useWaitForSelector< HTMLIFrameElement >( 'iframe[name="editor-canvas"]' );
	const overlayRef = usePositionOverlay( editorElement );
	const [ blockEditorDocument, setBlockEditorDocument ] = useState< Document | null >( null );

	const isAwarenessOverlayEnabled = useSelect< SettingsStoreSelectors, boolean >( select => {
		return select( rtcSettingsStore ).isAwarenessOverlayEnabled();
	} );

	useEffect( () => {
		// When the iframe is loaded, set blockEditorDocument for modifying block editor contents.
		if ( iframeElement && iframeElement.contentDocument ) {
			onIframeLoad( iframeElement, () => {
				setBlockEditorDocument( iframeElement.contentDocument );
			} );
		}
	}, [ iframeElement ] );

	useBlockHighlighting( blockEditorDocument, isAwarenessOverlayEnabled );
	useRenderCursors( overlayRef.current, blockEditorDocument, awareness, isAwarenessOverlayEnabled );

	if ( editorElement === null ) {
		return null;
	}

	return (
		<div
			id="vip-realtime-collaboration-overlay"
			ref={ overlayRef }
			style={ {
				display: isAwarenessOverlayEnabled ? 'block' : 'none',
			} }
		>
			<AwarenessAvatars />
		</div>
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
