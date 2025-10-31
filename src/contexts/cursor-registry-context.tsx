/**
 * Cursor Registry - Singleton pattern
 *
 * This uses a singleton pattern instead of React Context because WordPress's Slot/Fill
 * implementation doesn't properly share Context between Fill components.
 *
 * EditorPresence and BlockCanvasCover.Fill appear to break Context propagation.
 * The singleton pattern works reliably across these boundaries.
 */

interface ScrollToCursorOptions {
	behavior?: ScrollBehavior;
	block?: ScrollLogicalPosition;
	inline?: ScrollLogicalPosition;
	highlightDuration?: number;
}

/**
 * Singleton cursor registry that stores references to cursor elements.
 * Uses arrow functions to preserve `this` binding when methods are destructured.
 */
class CursorRegistry {
	private cursorMap: Map< number, HTMLElement > = new Map();

	/**
	 * Register a cursor element when it's created
	 */
	public registerCursor = ( clientId: number, element: HTMLElement ): void => {
		this.cursorMap.set( clientId, element );
	};

	/**
	 * Get a cursor element by clientId
	 */
	public getCursorElement = ( clientId: number ): HTMLElement | null => {
		return this.cursorMap.get( clientId ) ?? null;
	};

	/**
	 * Scroll to a cursor by clientId
	 * @returns true if cursor was found and scrolled to, false otherwise
	 */
	public scrollToCursor = ( clientId: number, options?: ScrollToCursorOptions ): boolean => {
		const cursorElement = this.cursorMap.get( clientId );

		if ( ! cursorElement ) {
			return false;
		}

		// Scroll the cursor into view - browser automatically finds scrollable container
		cursorElement.scrollIntoView( {
			behavior: options?.behavior ?? 'smooth',
			block: options?.block ?? 'center',
			inline: options?.inline ?? 'nearest',
		} );

		// Optional: Add highlight effect
		if ( options?.highlightDuration ) {
			this.highlightCursor( cursorElement, options.highlightDuration );
		}

		return true;
	};

	/**
	 * Remove all cursor elements from DOM and clear the registry.
	 * Uses stored refs instead of DOM queries for better performance.
	 */
	public removeAll = (): void => {
		// Remove each cursor element using stored refs
		this.cursorMap.forEach( element => {
			element.remove();
		} );
		// Clear the registry
		this.cursorMap.clear();
	};

	/**
	 * Add a temporary highlight effect to the cursor
	 */
	private highlightCursor = ( element: HTMLElement, duration: number ): void => {
		// Add highlight class
		element.classList.add( 'vip-real-time-collaboration-cursor-highlighted' );

		// Remove after duration
		setTimeout( () => {
			element.classList.remove( 'vip-real-time-collaboration-cursor-highlighted' );
		}, duration );
	};
}

// Export singleton instance
export const cursorRegistry = new CursorRegistry();
