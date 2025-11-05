type LastActivityGetter = () => number | null;

/**
 * Monitors user inactivity in a collaborative session by periodically checking
 * the last activity timestamp. Triggers a callback if inactivity exceeds a
 * specified timeout.
 */
export class UserInactivityTimer {
	private timer: NodeJS.Timeout | null = null;

	/**
	 * Initializes the class.
	 *
	 * @param timeoutMs The inactivity timeout in milliseconds
	 * @param getLastActivity Function to retrieve the last activity timestamp
	 * @param onTimeout Callback to invoke when inactivity timeout is reached
	 */
	constructor(
		private timeoutMs: number,
		private getLastActivity: LastActivityGetter,
		private onTimeout: () => void
	) {}

	/**
	 * Starts the inactivity timer, stopping any previous timer.
	 */
	public start(): void {
		this.stop();
		this.timer = setTimeout( () => this.handleTimeout(), this.timeoutMs );
	}

	/**
	 * Restarts the inactivity timer for the full timeout period.
	 *
	 * Alias of start().
	 */
	public restart(): void {
		this.start();
	}

	/**
	 * Stops the inactivity timer if it is running.
	 */
	public stop(): void {
		if ( this.timer ) {
			clearTimeout( this.timer );
			this.timer = null;
		}
	}

	/**
	 * Returns the configured timeout duration in milliseconds.
	 */
	public getTimeoutMs(): number {
		return this.timeoutMs;
	}

	/**
	 * Timeout handler that re-checks last user activity time and either resets
	 * the timer or calls the provided onTimeout callback.
	 */
	private handleTimeout(): void {
		const lastActivity = this.getLastActivity();

		if ( lastActivity !== null ) {
			const elapsed = Date.now() - lastActivity;

			if ( elapsed < this.timeoutMs ) {
				this.start();

				return;
			}
		}

		this.onTimeout();
	}
}
