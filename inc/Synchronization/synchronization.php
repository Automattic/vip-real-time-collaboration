<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\Synchronization;

/**
 * Handles Yjs document synchronization for WordPress posts.
 *
 * Maintains the <!-- y:gutenberg [..] --> comment, which contains the Yjs document
 * state in a base64 encoded format for collaborative editing.
 */
class Synchronization {

	/**
	 * Initialize synchronization filters.
	 *
	 */
	public static function init(): void {
		add_filter( 'wp_insert_post_data', [ self::class, 'filter_post_content_ydoc' ], 10, 1 );
		add_filter( 'heartbeat_received', [ self::class, 'sync_heartbeat' ], 10, 2 );
	}

	/**
	 * Maintains the <!-- y:gutenberg [..] --> comment, which contains the Yjs document
	 * state in a base64 encoded format.
	 *
	 *   <!-- y:gutenberg version="1" state="(base64-encoded Yjs doc)" new-content-clientid="(u53)" -->
	 *
	 * The comment tag will be part of the HTML content and enables collaborative
	 * clients to exchange editing history. It is used to keep a Yjs document
	 * in-sync with the HTML content. For forwards-compatibility, we also maintain a
	 * version property that can be used in the future by clients to properly handle
	 * legacy y:gutenberg comments.
	 *
	 * The Yjs document state contains information that is needed for automatic
	 * conflict resolution to enable collaborative editing on the HTML content.
	 * Collaboration-enabled clients will try to keep the Yjs state in-sync with
	 * the HTML content.
	 *
	 * Legacy clients may manipulate the HTML state without updating the Yjs
	 * document. Ideally, they leave the y:gutenberg comment alone. Once a
	 * collaboration-enabled client recognizes that the HTML content changed and is
	 * not in-sync with the Yjs state, it will update the Yjs document.
	 *
	 * To ensure that all clients update the Yjs state in "the same way" and
	 * produce the same Yjs update, all client must use the same Yjs-clientid. This
	 * clientid must change whenever the HTML content updates, to prevent the
	 * creation of conflicting Yjs updates.
	 *
	 * Note: Yjs has a concept of clientId that is very different from the
	 * clientIds used in the block editor. Yjs' clientIds should be unique per
	 * client (i.e. each browser tab has a different clientId) and are used for
	 * conflict-resolution.
	 *
	 * It is usually not recommended to change the clientid, as this can corrup the
	 * Yjs document and make it unusable. Please consult an expert on Yjs CRDTs
	 * before changing this approach.
	 *
	 * This approach is not ideal and may - under very specific circumstances -
	 * lead to content duplication.
	 *
	 * When multiple changes to the HTML document happen (without updating the Yjs
	 * state) while multiple collaboration-enabled clients listen to changes, it
	 * may result in content duplication.
	 *
	 * Example:
	 *
	 *   - Change 1: Paragraph 1 is added to the HTML content without updating the
	 *               Yjs document.
	 *   - Change 2: Paragraph 2 is added to the HTML content without updating the
	 *               Yjs document. This change happens immediately after change 1.
	 *               So this changes also incorporates the changeset of change 1.
	 *
	 * Result:
	 *
	 *   - Clients that see change 1 will add paragraph 1 to the Yjs document.
	 *   - Clients that see change 2 will add paragraph 1 and paragraph 2 to the
	 *     Yjs document, using a different clientid.
	 *   - In total, three paragraphs are added. The clients have no way of knowing
	 *     that change 2 incorporates changes from change 2.
	 *
	 * If content duplication happens a lot, it may be necessary to increase the
	 * debounce interval between fetching document states.
	 *
	 * A real solution would be to maintain diffs in the y:gutenberg comment when changes
	 * happen without Yjs noticing. However, such an implementation will further
	 * increase the size of the y:gutenberg comment.
	 *
	 * In practice, we can accept content duplication in some edge-cases. This
	 * is better that the status quo, which overwrites existing content and can
	 * lead to data loss.
	 *
	 * @param array $data Post data array containing post_type and post_content.
	 *
	 * @return array Modified post data with updated Yjs document state.
	 */
	public static function filter_post_content_ydoc( array $data ): array {
		if ( 'post' !== $data['post_type'] && 'revision' !== $data['post_type'] ) {
			return $data;
		}
		$gutenberg_experiments = get_option( 'gutenberg-experiments' );
		if ( ! $gutenberg_experiments || ! array_key_exists( 'gutenberg-sync-collaboration', $gutenberg_experiments ) ) {
			return $data;
		}
		$content = stripslashes( $data['post_content'] );
		$yinfo = self::get_yinfo( $content );
		if ( $yinfo ) {
			$content = substr( $content, 0, $yinfo['commentStart'] ) . substr( $content, $yinfo['commentEnd'] );
			$ynewclientid = wp_rand( 0, 9007199254740991 );
			$updated_yinfo = '<!-- y:gutenberg version="' . $yinfo['version'] . '" state="' . $yinfo['state'] . '" new-content-clientid="' . $ynewclientid . '" -->';
			$data['post_content'] = addslashes( $content . $updated_yinfo );
		}
		return $data;
	}

	/**
	 * Extracts the <!-- y:gutenberg .. --> comment from HTML content and returns the encoded data.
	 *
	 * @param string $content HTML content containing the y:gutenberg comment.
	 *
	 * @return array|null Array containing Yjs document information or null if not found.
	 */
	public static function get_yinfo( string $content ): ?array {
		preg_match( '/<!-- y:gutenberg version="([a-zA-Z0-9]*)" state="([a-zA-Z0-9+\/]*={0,3})" new-content-clientid="([0-9]*)" -->/', $content, $match, PREG_OFFSET_CAPTURE );
		if ( $match ) {
			return array(
				'comment' => $match[0][0],
				'version' => $match[1][0],
				'state' => $match[2][0],
				'new-content-clientid' => $match[3][0],
				'commentStart' => $match[0][1],
				'commentEnd' => $match[0][1] + strlen( $match[0][0] ),
			);
		}
		return null;
	}

	/**
	 * The client may request Yjs updates via the heartbeat api. It requests by
	 * supplying the last known "new-content-clientid", which changes whenever the
	 * document is written to the database. If the requested document has the same
	 * "new-content-clientid", then no update will be returned.
	 *
	 * @param array $response The heartbeat response array.
	 * @param array $data     The heartbeat data array containing y-sync requests.
	 *
	 * @return array Modified heartbeat response with synchronization data.
	 */
	public static function sync_heartbeat( array $response, array $data ): array {
		if ( empty( $data['y-sync'] ) ) {
			return $response;
		}
		$updated_documents = array();

		foreach ( $data['y-sync'] as $posttype => $requested_docs ) {
			if ( strcmp( $posttype, 'postType/Posts' ) === 0 ) {
				$docs = array();
				foreach ( $requested_docs as $postid => $expected_client_id ) {
					$post = wp_get_post_autosave( $postid );
					if ( $post ) {
						$postcontent = stripslashes( $post->post_content );
						$yinfo = self::get_yinfo( $postcontent );
						if ( $yinfo && strcmp( $yinfo['new-content-clientid'], strval( $expected_client_id ) ) !== 0 ) {
							$docs[ $postid ] = array(
								'contentClientId' => $yinfo['new-content-clientid'],
								'state' => $yinfo['state'],
							);
						}
					}
				}
				$updated_documents[ $posttype ] = $docs;
			}
		}
		$response['y-sync'] = $updated_documents;
		return $response;
	}
}
