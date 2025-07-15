import { useSelect } from '@wordpress/data';
import { createRoot, useRef } from '@wordpress/element';
import { type SyncProvider } from '@wordpress/sync';

import './awareness-avatars.scss';
import { AwarenessAvatars } from './awareness-avatars';
import { useBlockHighlighting } from '../hooks/use-block-highlighting';
import { usePositionOverlay } from '../hooks/use-position-overlay';
import { useWaitForSelector } from '../hooks/use-wait-for-selector';
import { store as rtcSettingsStore, SettingsStoreSelectors } from '../store/settings-store';

export function createRTCOverlay( awareness: SyncProvider[ 'awareness' ] ) {
	const div = document.createElement( 'div' );
	document.body.appendChild( div );

	const userAvatars = createRoot( div );
	userAvatars.render( <RTCOverlay awareness={ awareness } /> );
}

function RTCOverlay( { awareness }: { awareness: SyncProvider[ 'awareness' ] } ) {
	const overlayRef = useRef< HTMLDivElement >( null );
	const editorElement = useWaitForSelector( '.editor-visual-editor' );
	usePositionOverlay( overlayRef, editorElement );

	const isAwarenessOverlayEnabled = useSelect< SettingsStoreSelectors, boolean >( select => {
		return select( rtcSettingsStore ).isAwarenessOverlayEnabled();
	} );

	useBlockHighlighting( awareness, isAwarenessOverlayEnabled );

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
