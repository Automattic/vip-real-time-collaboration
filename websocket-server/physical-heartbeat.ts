import type { WebSocket } from 'ws';

const PHYSICAL_HEARTBEAT_INTERVAL_MS = 30_000;

export interface HeartbeatScheduler {
	setInterval(
		callback: () => void,
		intervalMs: number
	): ReturnType< typeof globalThis.setInterval >;
	clearInterval( handle: ReturnType< typeof globalThis.setInterval > ): void;
}

export const defaultHeartbeatScheduler: HeartbeatScheduler = {
	setInterval: ( callback, intervalMs ) => globalThis.setInterval( callback, intervalMs ),
	clearInterval: handle => globalThis.clearInterval( handle ),
};

/** Start the single transport-level liveness check for a multiplex connection. */
export function startPhysicalHeartbeat(
	physical: WebSocket,
	scheduler: HeartbeatScheduler = defaultHeartbeatScheduler
): () => void {
	let pongReceived = true;
	let stopped = false;
	const handlePong = (): void => {
		pongReceived = true;
	};
	const interval = scheduler.setInterval( () => {
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
		scheduler.clearInterval( interval );
		physical.off( 'pong', handlePong );
		physical.off( 'close', stop );
	};

	physical.on( 'pong', handlePong );
	physical.once( 'close', stop );
	return stop;
}
