import { useSelect } from '@wordpress/data';
import { createRoot } from '@wordpress/element';
import { type SyncProvider } from '@wordpress/sync';

import './awareness-avatars.scss';
import { AwarenessAvatars } from './avatars';
import { useBlockHighlighting } from '../hooks/use-block-highlighting';
import { usePositionOverlay } from '../hooks/use-position-overlay';
import { useWaitForSelector } from '../hooks/use-wait-for-selector';
import { store as rtcSettingsStore, SettingsStoreSelectors } from '../store/settings-store';
import { useRenderCursors } from '@/hooks/use-render-cursors';

export function createRTCOverlay( awareness: SyncProvider[ 'awareness' ] ) {
	const div = document.createElement( 'div' );
	document.body.appendChild( div );

	const overlayRoot = createRoot( div );
	overlayRoot.render( <RTCOverlay awareness={ awareness } /> );
}

function RTCOverlay( { awareness }: { awareness: SyncProvider[ 'awareness' ] } ) {
	const editorElement = useWaitForSelector( '.editor-visual-editor' );
	const overlayRef = usePositionOverlay( editorElement );

	const isAwarenessOverlayEnabled = useSelect< SettingsStoreSelectors, boolean >( select => {
		return select( rtcSettingsStore ).isAwarenessOverlayEnabled();
	} );

	useBlockHighlighting( awareness, isAwarenessOverlayEnabled );
	useRenderCursors( overlayRef.current, editorElement, awareness, isAwarenessOverlayEnabled );

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
