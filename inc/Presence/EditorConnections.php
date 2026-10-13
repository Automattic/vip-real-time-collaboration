<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Presence;

defined( 'ABSPATH' ) || exit();

use function add_filter;
use function current_user_can;
use function get_transient;
use function set_transient;

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
 * has closed reads as 0.
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
	 * Upper bound on a believable count, so a bad report cannot store anything
	 * odd.
	 */
	private const MAX_CONNECTIONS = 1000;

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
	 */
	public static function record( array $response, array $data ): array {
		$counts = $data[ self::HEARTBEAT_KEY ] ?? null;
		if ( ! is_array( $counts ) ) {
			return $response;
		}

		foreach ( $counts as $post_id => $connections ) {
			$post_id = (int) $post_id;
			$connections = (int) $connections;

			if ( $post_id <= 0 || $connections < 1 || $connections > self::MAX_CONNECTIONS ) {
				continue;
			}

			if ( ! current_user_can( 'edit_post', $post_id ) ) {
				continue;
			}

			set_transient( self::transient_key( $post_id ), $connections, self::TTL );
		}

		return $response;
	}

	/**
	 * Editor connections open on a post, as last reported. 0 when no editor
	 * has reported within the TTL.
	 */
	public static function get_count( int $post_id ): int {
		if ( $post_id <= 0 ) {
			return 0;
		}

		$count = get_transient( self::transient_key( $post_id ) );

		return is_numeric( $count ) ? (int) $count : 0;
	}

	private static function transient_key( int $post_id ): string {
		return 'vip_rtc_editor_connections_' . $post_id;
	}
}
