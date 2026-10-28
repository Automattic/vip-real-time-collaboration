<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Presence;

defined( 'ABSPATH' ) || exit();

use function add_filter;
use function current_user_can;
use function get_transient;
use function set_transient;
use function usleep;
use function wp_cache_add;
use function wp_cache_delete;

/**
 * Keeps the number of editor connections open on each post, as reported by
 * the editors themselves on the heartbeat.
 *
 * Code that writes a post on the server — a workflow agent, an import — writes
 * around the shared document, so with two or more editors open the room and
 * the write overwrite each other. This lets that code ask first.
 *
 * Each editor reports the count it sees in the room's awareness, which counts
 * connections, not users: one person in two tabs is two. A disconnected editor
 * stops reporting, and a count nobody refreshes expires, so a post everyone
 * has closed reads as 0. A higher count holds against a lower report for
 * `HOLD_HIGHER` seconds, so departures show up a little late but a delayed
 * report never makes a shared post look free.
 *
 * Editors report at the same moment when someone joins, so each post's
 * read-compare-write runs under a short lock. Without it, two reports can both
 * read the old count and the lower one can land last.
 */
final class EditorConnections {
	/**
	 * Heartbeat field the editor sends, keyed by post ID. Matches
	 * `EDITOR_CONNECTIONS_HEARTBEAT_KEY` in `src/utilities/editor-connections.ts`.
	 */
	public const HEARTBEAT_KEY = 'vip_rtc_editor_connections';

	/**
	 * How long a report stands without a refresh, in seconds. The same window
	 * WordPress gives a post lock, which the editor also refreshes on the
	 * heartbeat.
	 */
	public const TTL = 150;

	/**
	 * How long a count stands against a lower report, in seconds. Reports from
	 * different editors can arrive out of order, so a lower one may be stale.
	 * Wrongly reading a post as shared only holds a write back, while wrongly
	 * reading it as free loses edits, so a drop is believed only once nobody
	 * has confirmed the higher count for about a heartbeat interval.
	 */
	public const HOLD_HIGHER = 60;

	/**
	 * Upper bound on a believable count, so a bad report cannot store anything
	 * odd.
	 */
	private const MAX_CONNECTIONS = 1000;

	/**
	 * Object cache group for the per-post lock around a report.
	 */
	private const LOCK_GROUP = 'vip_rtc_editor_connections';

	/**
	 * How long a lock stands if the request holding it dies, in seconds.
	 */
	private const LOCK_TTL = 5;

	/**
	 * How many times to try for a busy lock, and how long to wait between
	 * tries, in microseconds. The lock is held only for one read and one write,
	 * so it is free again well within this.
	 */
	private const LOCK_ATTEMPTS = 3;
	private const LOCK_WAIT = 50000;

	public static function init(): void {
		add_filter( 'heartbeat_received', [ __CLASS__, 'record' ], 10, 2 );
	}

	/**
	 * Store the counts an editor sent with its heartbeat, for posts the
	 * current user may edit.
	 *
	 * @param array<string, mixed> $response Heartbeat response.
	 * @param array<string, mixed> $data     Heartbeat data sent by the editor.
	 * @return array<string, mixed>
	 *
	 * @psalm-suppress PossiblyUnusedReturnValue Psalm does not detect usage via add_filter.
	 */
	public static function record( array $response, array $data ): array {
		$counts = $data[ self::HEARTBEAT_KEY ] ?? null;
		if ( ! is_array( $counts ) ) {
			return $response;
		}

		/** @psalm-suppress MixedAssignment Untrusted input; cast and range-checked below. */
		foreach ( $counts as $post_id => $connections ) {
			$post_id = (int) $post_id;
			$connections = (int) $connections;

			if ( $post_id <= 0 || $connections < 1 || $connections > self::MAX_CONNECTIONS ) {
				continue;
			}

			if ( ! current_user_can( 'edit_post', $post_id ) ) {
				continue;
			}

			// A report that cannot get the lock is dropped. The editor sends
			// the count again on its next heartbeat.
			if ( ! self::lock( $post_id ) ) {
				continue;
			}

			try {
				self::store( $post_id, $connections );
			} finally {
				self::unlock( $post_id );
			}
		}

		return $response;
	}

	/**
	 * Store a reported count unless a higher one still holds. Call only while
	 * holding the post's lock.
	 */
	private static function store( int $post_id, int $connections ): void {
		$stored = self::read( $post_id );
		if ( null !== $stored && $connections < $stored['count'] && time() - $stored['reported_at'] < self::HOLD_HIGHER ) {
			return;
		}

		set_transient(
			self::transient_key( $post_id ),
			[
				'count' => $connections,
				'reported_at' => time(),
			],
			self::TTL
		);
	}

	/**
	 * Take the post's lock. `wp_cache_add()` only succeeds when the key is
	 * absent, and the persistent object cache VIP runs makes that atomic
	 * across requests.
	 */
	private static function lock( int $post_id ): bool {
		for ( $attempt = 1; $attempt <= self::LOCK_ATTEMPTS; $attempt++ ) {
			// phpcs:ignore WordPressVIPMinimum.Performance.LowExpiryCacheTime.CacheTimeUndetermined -- A lock, not a cached value; it should lapse quickly.
			if ( wp_cache_add( self::transient_key( $post_id ), 1, self::LOCK_GROUP, self::LOCK_TTL ) ) {
				return true;
			}

			if ( $attempt < self::LOCK_ATTEMPTS ) {
				usleep( self::LOCK_WAIT );
			}
		}

		return false;
	}

	private static function unlock( int $post_id ): void {
		wp_cache_delete( self::transient_key( $post_id ), self::LOCK_GROUP );
	}

	/**
	 * Editor connections open on a post, as last reported. 0 when no editor
	 * has reported within the TTL.
	 *
	 * 0 means no editor is reporting, not that none has the post open.
	 * WordPress suspends the heartbeat after 60 minutes without user activity,
	 * even on the post editor, so editors left idle that long stop reporting
	 * while their tabs still hold the document. A post lock is released the
	 * same way. Treat the count as a guard against writing over active
	 * editing, not a guarantee.
	 *
	 * @psalm-suppress PossiblyUnusedMethod Called by other plugins, e.g. VIP Workflows.
	 */
	public static function get_count( int $post_id ): int {
		if ( $post_id <= 0 ) {
			return 0;
		}

		return self::read( $post_id )['count'] ?? 0;
	}

	/**
	 * The stored report for a post, or null when there is none.
	 *
	 * @return array{count: int, reported_at: int}|null
	 */
	private static function read( int $post_id ): ?array {
		/** @psalm-suppress MixedAssignment get_transient() returns mixed; checked below. */
		$stored = get_transient( self::transient_key( $post_id ) );

		if ( ! is_array( $stored ) ) {
			return null;
		}

		/** @psalm-suppress MixedAssignment Checked below. */
		$count = $stored['count'] ?? null;
		/** @psalm-suppress MixedAssignment Checked below. */
		$reported_at = $stored['reported_at'] ?? null;

		if ( ! is_int( $count ) || ! is_int( $reported_at ) ) {
			return null;
		}

		return [
			'count' => $count,
			'reported_at' => $reported_at,
		];
	}

	/**
	 * @psalm-pure
	 */
	private static function transient_key( int $post_id ): string {
		return 'vip_rtc_editor_connections_' . $post_id;
	}
}
