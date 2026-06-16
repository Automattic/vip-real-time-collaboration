import { applyFilters } from '@wordpress/hooks';

/**
 * WordPress hook used to cap the number of concurrent client connections
 * allowed in a single sync room. Each browser tab is one connection, so this
 * limits connections, not unique collaborators — a single user with several
 * tabs counts once per tab. This deliberately reuses the same filter name
 * exposed by Gutenberg's default (polling) sync provider, which likewise caps
 * raw client connections per room, so sites that already cap the default
 * transport keep working after the VIP Real-Time Collaboration plugin swaps in
 * its WebSocket provider.
 *
 * @example
 * addFilter(
 *   'sync.pollingProvider.maxClientsPerRoom',
 *   'my-plugin/cap',
 *   ( limit, room ) => ( room.includes( 'postType/page-739' ) ? 2 : limit )
 * );
 */
export const MAX_CLIENTS_PER_ROOM_FILTER = 'sync.pollingProvider.maxClientsPerRoom';

/**
 * Awareness state field Gutenberg already publishes for every client
 * (see core-data's `BaseAwarenessState.setCurrentCollaboratorInfo`). We read it
 * rather than writing our own field: Gutenberg's awareness rejects unregistered
 * fields (`No equality check implemented for awareness state field "…"`), and
 * `collaboratorInfo` already carries the join time we use to rank connections.
 */
export const COLLABORATOR_INFO_FIELD = 'collaboratorInfo';

/**
 * Sentinel returned when no limit is configured. Treated as "unlimited" so the
 * default behaviour is unchanged unless a site opts in via the filter.
 */
const NO_LIMIT = 0;

export interface RoomLimitPresence {
	/** The awareness clientID for this connection (unique per browser tab). */
	clientId: number;
	/** Wall-clock timestamp (ms) recorded when the connection joined the room. */
	joinedAt: number;
}

/**
 * Resolve the configured per-room client limit for a given room.
 *
 * Returns `0` (unlimited) by default; a site enables the cap by returning a
 * positive integer from the {@link MAX_CLIENTS_PER_ROOM_FILTER} filter.
 *
 * @param {string} roomName The sync room name (e.g. `site-1/postType/page-739`).
 * @return {number} The configured limit, or `0` for unlimited.
 */
export function getMaxClientsPerRoom( roomName: string ): number {
	const limit = applyFilters( MAX_CLIENTS_PER_ROOM_FILTER, NO_LIMIT, roomName );
	return typeof limit === 'number' ? limit : NO_LIMIT;
}

/**
 * Whether a configured limit value actually enforces a cap. Non-positive or
 * non-finite values mean "unlimited".
 *
 * @param {number} limit The configured limit.
 * @return {boolean} True when the limit should be enforced.
 */
export function isLimitEnforced( limit: number ): boolean {
	return Number.isFinite( limit ) && limit > NO_LIMIT;
}

/**
 * Shape of the relevant part of Gutenberg's `collaboratorInfo` awareness field.
 */
interface CollaboratorInfo {
	/** Wall-clock timestamp (ms) Gutenberg stamps when the connection joined. */
	enteredAt?: number;
}

/**
 * Extract one presence record per connected client from a map of awareness
 * states, reading Gutenberg's own `collaboratorInfo` field for the join time.
 * Each awareness clientID is a distinct connection (one per tab), so multiple
 * tabs of the same user yield multiple records — this counts connections.
 *
 * Peers that have not yet published `collaboratorInfo` are skipped; they will
 * appear on a subsequent awareness change once their local state propagates.
 *
 * @param {Map<number, Record<string, unknown>>} states Awareness states keyed by clientID.
 * @return {RoomLimitPresence[]} The parsed presence records.
 */
export function readPresences(
	states: Map< number, Record< string, unknown > >
): RoomLimitPresence[] {
	const presences: RoomLimitPresence[] = [];

	for ( const [ clientId, state ] of states ) {
		const info = state?.[ COLLABORATOR_INFO_FIELD ];
		if ( ! info || typeof info !== 'object' ) {
			continue;
		}

		const { enteredAt } = info as CollaboratorInfo;
		presences.push( {
			clientId,
			joinedAt: typeof enteredAt === 'number' ? enteredAt : Number.POSITIVE_INFINITY,
		} );
	}

	return presences;
}

/**
 * Order two connections by join time, breaking ties on clientID so every client
 * computes the same total order without depending on a server.
 */
function byJoinOrder( a: RoomLimitPresence, b: RoomLimitPresence ): number {
	return a.joinedAt - b.joinedAt || a.clientId - b.clientId;
}

/**
 * Decide whether the local connection is within the room's client limit.
 *
 * Every client runs this same calculation over the shared awareness state and
 * reaches the same conclusion, so the connections that sort past the limit are
 * the ones that voluntarily yield. Each connection (browser tab) counts on its
 * own — there is no per-user dedupe — and connections are ordered by join time
 * with the clientID as a deterministic tie-breaker, so the newest connections
 * are the ones that yield.
 *
 * Note: this is cooperative, best-effort enforcement. `joinedAt` comes from
 * each client's own clock, so clock skew can change which connection keeps the
 * slot when two join close together (the `clientId` tie-break keeps the result
 * deterministic, not skew-proof). Simultaneous joins can also momentarily
 * exceed the limit before awareness settles, and it is not a security boundary.
 * Authoritative ordering and enforcement must live on the server.
 *
 * @param {RoomLimitPresence[]} presences     All connections currently in the room (including ours).
 * @param {number}              localClientId Our own awareness clientID.
 * @param {number}              limit         The configured per-room connection limit.
 * @return {boolean} True when the local connection may remain.
 */
export function isLocalClientWithinLimit(
	presences: RoomLimitPresence[],
	localClientId: number,
	limit: number
): boolean {
	if ( ! isLimitEnforced( limit ) ) {
		return true;
	}

	const ordered = [ ...presences ].sort( byJoinOrder );
	const rank = ordered.findIndex( presence => presence.clientId === localClientId );

	// If we can't find ourselves yet, assume we're within the limit rather than
	// evicting on incomplete information.
	if ( rank === -1 ) {
		return true;
	}

	return rank < limit;
}
