interface ScrollToCursorOptions {
	behavior?: ScrollBehavior;
	block?: ScrollLogicalPosition;
	inline?: ScrollLogicalPosition;
	highlightDuration?: number;
}

/**
 * Cursor Registry
 * ===
 * This registry stores references to cursor elements so that we can access them
 * in different parts of the component tree. This would more ideally be solved
 * with React context or state in the awareness store, but:
 *
 * 1. EditorPresence and BlockCanvasCover slot/fill break context propagation. We
 *    don't currently have a way to provide context to both the slot and fill.
 * 2. Storing pointers to the cursor elements in the awareness store might be a
 *    better solution, but would require broader refactoring.
 *
 * For now, we create an instance of this registry in a React ref and pass it
 * down to the components that need it.
 */
export class CursorRegistry {
	private cursorMap: Map< number, HTMLElement > = new Map();

	/**
	 * Register a cursor element when it's created
	 */
	public registerCursor( clientId: number, element: HTMLElement ): void {
		this.cursorMap.set( clientId, element );
	}

	/**
	 * Scroll to a cursor by clientId
	 * @returns true if cursor was found and scrolled to, false otherwise
	 */
	public scrollToCursor( clientId: number, options?: ScrollToCursorOptions ): boolean {
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
	}

	/**
	 * Remove all cursor elements from DOM and clear the registry.
	 * Uses stored refs instead of DOM queries for better performance.
	 */
	public removeAll(): void {
		// Remove each cursor element using stored refs
		this.cursorMap.forEach( element => element.remove() );
		// Clear the registry
		this.cursorMap.clear();
	}

	/**
	 * Add a temporary highlight effect to the cursor
	 */
	private highlightCursor( element: HTMLElement, duration: number ): void {
		// Add highlight class
		element.classList.add( 'vip-real-time-collaboration-cursor-highlighted' );

		// Remove after duration
		setTimeout( () => {
			element.classList.remove( 'vip-real-time-collaboration-cursor-highlighted' );
		}, duration );
	}
}
