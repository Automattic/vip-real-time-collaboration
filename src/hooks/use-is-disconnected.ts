import { useSelect } from '@wordpress/data';
import { useEffect, useRef, useState } from '@wordpress/element';

import { AwarenessStoreSelectors, store as awarenessStore } from '@/store/awareness-store';
import { DISCONNECTED_THRESHOLD_IN_MS } from '@/utilities/config';

export function useIsDisconnected(): boolean {
	const [ disconnectedPastThreshold, setDisconnectedPastThreshold ] = useState< boolean >( false );
	const timeoutRef = useRef< NodeJS.Timeout | null >( null );

	const isDisconnected = useSelect< AwarenessStoreSelectors, boolean >( select => {
		return select( awarenessStore ).isDisconnected();
	} );

	useEffect( () => {
		if ( ! isDisconnected ) {
			setDisconnectedPastThreshold( false );
			clearTimeout( timeoutRef.current ?? undefined );
		}

		if ( isDisconnected ) {
			timeoutRef.current = setTimeout( () => {
				setDisconnectedPastThreshold( true );
			}, DISCONNECTED_THRESHOLD_IN_MS );
		}

		return () => clearTimeout( timeoutRef.current ?? undefined );
	}, [ isDisconnected ] );

	return disconnectedPastThreshold;
}
