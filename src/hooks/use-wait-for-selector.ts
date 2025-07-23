import { useEffect, useState } from '@wordpress/element';

import { throttleByAnimationFrame } from '../utilities/throttle';

// How often to poll for the selector when it's not present in the DOM.
const POLL_INTERVAL = 200;

/**
 * This hook is used to wait for a selector to be present in the DOM.
 * If it's found, use a MutationObserver to watch for a removal of the item.
 * If it's not found, poll for the selector until available.
 *
 * @param targetSelector The selector to wait for.
 * @returns The target element, or null if it doesn't exist
 */
export function useWaitForSelector< T extends HTMLElement = HTMLElement >(
	targetSelector: string
): T | null {
	const [ element, setElement ] = useState< T | null >( null );

	useEffect( () => {
		let pollInterval: NodeJS.Timeout | null = null;
		let parentObserver: MutationObserver | null = null;

		const checkForElement = () => {
			const testTargetElement = document.querySelector( targetSelector ) as T;
			setElement( testTargetElement || null );

			return testTargetElement;
		};

		const startPolling = () => {
			if ( pollInterval ) {
				clearInterval( pollInterval );
			}

			pollInterval = setInterval( () => {
				const foundElement = checkForElement();

				if ( foundElement ) {
					stopPolling();
					startObserving( foundElement );
				}
			}, POLL_INTERVAL );
		};

		const stopPolling = () => {
			if ( pollInterval ) {
				clearInterval( pollInterval );
				pollInterval = null;
			}
		};

		const startObserving = ( targetElement: HTMLElement ) => {
			const throttledParentCheck = throttleByAnimationFrame( () => {
				const currentElement = checkForElement();
				if ( ! currentElement ) {
					// Element was removed, fall back to polling
					stopObserving();
					startPolling();
				}
			} );

			// Observe the parent element to watch for removal of the target element.
			if ( targetElement.parentElement ) {
				parentObserver = new MutationObserver( throttledParentCheck );
				parentObserver.observe( targetElement.parentElement, {
					childList: true,
					subtree: false, // Only watch direct children
				} );
			}
		};

		const stopObserving = () => {
			if ( parentObserver ) {
				parentObserver.disconnect();
				parentObserver = null;
			}
		};

		const initialElement = checkForElement();

		if ( initialElement ) {
			// If the element exists, watch for mutations to see if it's removed.
			startObserving( initialElement );
		} else {
			// If the element doesn't exist, poll for the selector.
			startPolling();
		}

		return () => {
			stopPolling();
			stopObserving();
		};
	}, [ targetSelector ] );

	return element;
}
