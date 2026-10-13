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
 * A disconnected client removes its post instead of reporting: offline, its
 * awareness collapses to itself, and reporting that 1 would tell the server
 * the post is free while others are still editing it.
 *
 * @param {EditorConnectionCounts} counts      Counts to update.
 * @param {number}                 postId      Post ID.
 * @param {boolean}                connected   Whether the room is connected.
 * @param {number}                 connections Open connections, when connected.
 * @return {boolean} True when what the next heartbeat will report changed.
 */
export function recordConnections(
	counts: EditorConnectionCounts,
	postId: number,
	connected: boolean,
	connections: number
): boolean {
	const previous = counts.get( postId );

	if ( ! connected || connections < 1 ) {
		counts.delete( postId );
		return previous !== undefined;
	}

	counts.set( postId, connections );
	return previous !== connections;
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
