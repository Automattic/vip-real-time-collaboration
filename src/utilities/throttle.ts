/**
 * Creates a throttled version of a callback using requestAnimationFrame.
 *
 * @param callback - The function to throttle.
 * @returns A throttled version of the callback.
 */
export function throttleByAnimationFrame( callback: () => void ) {
	let animationFrameId: number | null = null;

	return () => {
		if ( animationFrameId !== null ) {
			cancelAnimationFrame( animationFrameId );
		}
		animationFrameId = requestAnimationFrame( () => {
			callback();
		} );
	};
}
