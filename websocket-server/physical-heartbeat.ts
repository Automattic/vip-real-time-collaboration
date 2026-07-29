import type { WebSocket } from 'ws';

const PHYSICAL_HEARTBEAT_INTERVAL_MS = 30_000;

/** Start the single transport-level liveness check for a multiplex connection. */
export function startPhysicalHeartbeat( physical: WebSocket ): () => void {
	let pongReceived = true;
	let stopped = false;
	const handlePong = (): void => {
		pongReceived = true;
	};
	const interval = setInterval( () => {
		if ( ! pongReceived ) {
			stop();
			physical.terminate();
			return;
		}
		pongReceived = false;
		try {
			physical.ping();
		} catch {
			stop();
			physical.terminate();
		}
	}, PHYSICAL_HEARTBEAT_INTERVAL_MS );
	const stop = (): void => {
		if ( stopped ) {
			return;
		}
		stopped = true;
		clearInterval( interval );
		physical.off( 'pong', handlePong );
		physical.off( 'close', stop );
	};

	physical.on( 'pong', handlePong );
	physical.once( 'close', stop );
	return stop;
}
