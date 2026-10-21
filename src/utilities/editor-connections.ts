import { readPresences } from '@/utilities/room-client-limit';

/**
 * Heartbeat field the editor reports open connections under, keyed by post ID.
 * Read on the server by `EditorConnections`, which keeps the latest count so
 * server code (for example a workflow agent about to write the post) can ask
 * whether anyone else has it open. Server writes never reach the shared
 * document, so that question decides whether such a write is safe.
 */
export const EDITOR_CONNECTIONS_HEARTBEAT_KEY = 'vip_rtc_editor_connections';

/**
 * Latest connection count per post, for every room this page is connected to.
 */
export type EditorConnectionCounts = Map< number, number >;

/**
 * Count the open connections in a room from its awareness states. Each
 * awareness client is one browser tab, so one person in two tabs counts twice:
 * those tabs still hold two copies of the document that can overwrite each
 * other. Includes the local client, so a post open only here counts 1.
 *
 * @param {Map<number, Record<string, unknown>>} states Awareness states keyed by clientID.
 * @return {number} Open connections.
 */
export function countConnections( states: Map< number, Record< string, unknown > > ): number {
	return readPresences( states ).length;
}

/**
 * Record one post's count and say whether it changed.
 *
 * A client that is not ready removes its post instead of reporting: offline,
 * or just reconnected, its awareness holds only itself, and reporting that 1
 * would tell the server the post is free while others are still editing it.
 *
 * @param {EditorConnectionCounts} counts      Counts to update.
 * @param {number}                 postId      Post ID.
 * @param {boolean}                ready       Whether the room is connected and its awareness has arrived.
 * @param {number}                 connections Open connections, when ready.
 * @return {boolean} True when what the next heartbeat will report changed.
 */
export function recordConnections(
	counts: EditorConnectionCounts,
	postId: number,
	ready: boolean,
	connections: number
): boolean {
	const previous = counts.get( postId );

	if ( ! ready || connections < 1 ) {
		counts.delete( postId );
		return previous !== undefined;
	}

	counts.set( postId, connections );
	return previous !== connections;
}

/**
 * How long to wait after connecting for the room's awareness before counting
 * anyway, in milliseconds. The server sends the room's awareness straight
 * after the socket opens, so this only runs out in an empty room.
 */
export const AWARENESS_WAIT_MS = 3000;

/**
 * Tracks whether a room's awareness can be counted yet.
 *
 * y-websocket drops every remote awareness state when a socket closes and
 * reports the socket open before the server has sent them again, so for a
 * moment after each connect the room looks like it holds only this client.
 * Counting then would report 1 for a shared post. The gate opens on the
 * first awareness update from the server, or after `waitMs` if none comes,
 * and calls `onOpen` so the caller can count.
 */
export class AwarenessGate {
	private open = false;
	private timer: ReturnType< typeof setTimeout > | null = null;

	constructor(
		private readonly onOpen: () => void,
		private readonly waitMs: number = AWARENESS_WAIT_MS
	) {}

	public isOpen(): boolean {
		return this.open;
	}

	/** The socket opened: wait for the room's awareness. */
	public connected(): void {
		this.close();
		this.timer = setTimeout( () => this.openNow(), this.waitMs );
	}

	/** The socket closed: stop counting until the next connect. */
	public disconnected(): void {
		this.close();
	}

	/** An awareness update arrived from the server. */
	public receivedAwareness(): void {
		if ( this.timer !== null ) {
			this.openNow();
		}
	}

	public destroy(): void {
		this.close();
	}

	private openNow(): void {
		this.clearTimer();
		this.open = true;
		this.onOpen();
	}

	private close(): void {
		this.clearTimer();
		this.open = false;
	}

	private clearTimer(): void {
		if ( this.timer !== null ) {
			clearTimeout( this.timer );
			this.timer = null;
		}
	}
}

/**
 * Add the counts to an outgoing heartbeat, if there are any.
 *
 * @param {EditorConnectionCounts}  counts Counts to report.
 * @param {Record<string, unknown>} data   Heartbeat data being sent.
 */
export function addToHeartbeat(
	counts: EditorConnectionCounts,
	data: Record< string, unknown >
): void {
	if ( counts.size > 0 ) {
		data[ EDITOR_CONNECTIONS_HEARTBEAT_KEY ] = Object.fromEntries( counts );
	}
}
