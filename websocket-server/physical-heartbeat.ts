import { WebSocket } from 'ws';

const PHYSICAL_HEARTBEAT_INTERVAL_MS = 30_000;

/** Start the single transport-level liveness check for a multiplex connection. */
export function startPhysicalHeartbeat(
	physical: WebSocket,
	{
		hasRooms,
		onEmpty,
		onUnresponsive,
	}: {
		hasRooms: () => boolean;
		onEmpty: () => void;
		onUnresponsive: () => void;
	}
): () => void {
	let pongReceived = true;
	let stopped = false;
	const handlePong = (): void => {
		pongReceived = true;
	};
	const interval = setInterval( () => {
		if ( physical.readyState !== WebSocket.OPEN ) {
			stop();
			return;
		}
		if ( ! hasRooms() ) {
			stop();
			onEmpty();
			return;
		}
		if ( ! pongReceived ) {
			stop();
			onUnresponsive();
			physical.terminate();
			return;
		}
		pongReceived = false;
		try {
			physical.ping();
		} catch {
			stop();
			onUnresponsive();
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
