import { useEffect, useRef } from '@wordpress/element';

import { throttleByAnimationFrame } from '../utilities/throttle';

/**
 * Position an overlay element over the position and size of a target element.
 *
 * @param targetElement - The element to overlay on top of.
 */
export function usePositionOverlay( targetElement: HTMLElement | null ) {
	const overlayRef = useRef< HTMLDivElement >( null );

	useEffect( () => {
		if ( targetElement === null ) {
			return;
		}

		const updatePosition = () => {
			const overlayElement = overlayRef.current;

			if ( ! overlayElement ) {
				return;
			}

			const rect = targetElement.getBoundingClientRect();

			overlayElement.style.top = `${ rect.top }px`;
			overlayElement.style.left = `${ rect.left }px`;
			overlayElement.style.width = `${ rect.width }px`;
			overlayElement.style.height = `${ rect.height }px`;
		};

		const throttledUpdatePosition = throttleByAnimationFrame( updatePosition );

		// Initial position update
		updatePosition();

		// Add callbacks for window events
		window.addEventListener( 'scroll', throttledUpdatePosition );
		window.addEventListener( 'resize', throttledUpdatePosition );

		// Add callback for resizes to the target element
		const resizeObserver = new ResizeObserver( throttledUpdatePosition );
		resizeObserver.observe( targetElement );

		return () => {
			window.removeEventListener( 'scroll', throttledUpdatePosition );
			window.removeEventListener( 'resize', throttledUpdatePosition );
			resizeObserver.disconnect();
		};
	}, [ targetElement ] );

	return overlayRef;
}
