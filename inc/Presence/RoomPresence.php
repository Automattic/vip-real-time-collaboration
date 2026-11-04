<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Presence;

defined( 'ABSPATH' ) || exit();

use function add_filter;
use function add_post_meta;
use function current_user_can;
use function delete_post_meta;
use function get_current_user_id;
use function get_post_meta;
use function update_post_meta;

/**
 * Who is actively editing each post in a collaboration room right now, as the
 * editors report it on the heartbeat.
 *
 * By default, the heartbeat ticks every 10 seconds in a focused block editor,
 * every 120 seconds in a tab without focus, and not at all once the user has
 * been idle for ten minutes. These values can be filtered.
 *
 * Therefore, this presence information cannot drive a lock, nor is it a count
 * of active connections to the WebSocket server. It is merely a hint for
 * processes that want a count of recent active editors.
 */
final class RoomPresence {
	/**
	 * Heartbeat field the editor sends with the ID of every post it has
	 * a connected room for. Matches `ROOM_PRESENCE_HEARTBEAT_KEY` in
	 * `src/utilities/config.ts`.
	 */
	public const HEARTBEAT_KEY = 'vip_rtc_rooms';

	/**
	 * Post meta key. Not single: one row per report.
	 */
	public const META_KEY = '_vip_rtc_room_presence';

	/**
	 * TTL of post meta entries. If the filtered heartbeat interval exceeds
	 * this value, editor presence will "flicker."
	 */
	public const TTL = 30;

	public static function init(): void {
		add_filter( 'heartbeat_received', [ __CLASS__, 'record' ], 10, 2 );
		add_filter( 'wxr_export_skip_postmeta', [ __CLASS__, 'skip_export' ], 10, 2 );
	}

	/**
	 * Write the current user's presence on every post the heartbeat reports.
	 *
	 * @param array<string, mixed> $response Heartbeat response.
	 * @param array<string, mixed> $data     Heartbeat data sent by the editor.
	 * @return array<string, mixed>
	 *
	 * @psalm-suppress PossiblyUnusedReturnValue Psalm does not detect usage via add_filter.
	 */
	public static function record( array $response, array $data ): array {
		$post_ids = $data[ self::HEARTBEAT_KEY ] ?? null;
		$user_id = get_current_user_id();

		if ( ! is_array( $post_ids ) || $user_id <= 0 ) {
			return $response;
		}

		/** @psalm-suppress MixedAssignment Untrusted input; checked below. */
		foreach ( $post_ids as $post_id ) {
			// The heartbeat is form-encoded, so IDs arrive as strings.
			if ( ! is_int( $post_id ) && ! ( is_string( $post_id ) && ctype_digit( $post_id ) ) ) {
				continue;
			}

			$post_id = (int) $post_id;
			if ( $post_id > 0 && current_user_can( 'edit_post', $post_id ) ) {
				self::stamp( $post_id, $user_id );
			}
		}

		return $response;
	}

	/**
	 * Get IDs of the users actively editing the post right now.
	 *
	 * @return array<int>
	 */
	public static function get_user_ids( int $post_id ): array {
		if ( $post_id <= 0 ) {
			return [];
		}

		$ids = [];
		$now = time();

		/** @psalm-suppress MixedAssignment get_post_meta() returns mixed; checked below. */
		foreach ( (array) get_post_meta( $post_id, self::META_KEY, false ) as $value ) {
			$row = self::parse( $value );

			// Delete expired rows and rows that do not parse.
			if ( null === $row || $now - $row[1] >= self::TTL ) {
				self::delete( $post_id, $value );
				continue;
			}

			// Two tabs of one user can add a row each; count the user once.
			$ids[ $row[0] ] = $row[0];
		}

		$ids = array_values( $ids );
		sort( $ids );

		return $ids;
	}

	/**
	 * Number of users actively editing the post right now.
	 *
	 * @psalm-suppress PossiblyUnusedMethod Called by other plugins, e.g. VIP Workflows.
	 */
	public static function count_users( int $post_id ): int {
		return count( self::get_user_ids( $post_id ) );
	}

	/**
	 * Keep the rows out of WXR exports, as core does for `_edit_lock`.
	 *
	 * @psalm-suppress PossiblyUnusedReturnValue Psalm does not detect usage via add_filter.
	 */
	public static function skip_export( bool $skip, string $meta_key ): bool {
		return $skip || self::META_KEY === $meta_key;
	}

	/**
	 * Replace the user's row(s) with one stamped now.
	 */
	private static function stamp( int $post_id, int $user_id ): void {
		$value = $user_id . ':' . time();
		$added = false;

		/** @psalm-suppress MixedAssignment get_post_meta() returns mixed; checked below. */
		foreach ( (array) get_post_meta( $post_id, self::META_KEY, false ) as $current ) {
			$row = self::parse( $current );
			if ( null === $row || $row[0] !== $user_id ) {
				continue;
			}

			if ( $added ) {
				self::delete( $post_id, $current );
			} elseif ( $current === $value ) {
				// Same second as the last report. An UPDATE that changes
				// nothing reports failure, so do not fall through to add.
				$added = true;
			} elseif ( false !== update_post_meta( $post_id, self::META_KEY, $value, $current ) ) {
				$added = true;
			}
		}

		if ( ! $added ) {
			add_post_meta( $post_id, self::META_KEY, $value );
		}
	}

	/**
	 * Delete one row by its exact value.
	 */
	private static function delete( int $post_id, mixed $value ): void {
		if ( is_string( $value ) ) {
			delete_post_meta( $post_id, self::META_KEY, $value );
		}
	}

	/**
	 * Parse a `{user_id}:{timestamp}` row.
	 *
	 * @return array{0: int, 1: int}|null User ID and timestamp.
	 */
	private static function parse( mixed $value ): ?array {
		if ( ! is_string( $value ) ) {
			return null;
		}

		$parts = explode( ':', $value );
		if ( 2 !== count( $parts ) || ! ctype_digit( $parts[0] ) || ! ctype_digit( $parts[1] ) ) {
			return null;
		}

		return [ (int) $parts[0], (int) $parts[1] ];
	}
}
