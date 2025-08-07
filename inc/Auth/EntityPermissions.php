<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Auth;

use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * WordPress Entity Permissions Handler
 *
 * Handles permission checking for post entities using custom sync capabilities
 */
final class EntityPermissions {
	/**
	 * Initialize sync capabilities system.
	 * Sets up meta capability mapping and role capabilities.
	 */
	public static function init(): void {
		add_filter( 'map_meta_cap', [ __CLASS__, 'map_sync_capabilities' ], 10, 4 );
		add_action( 'init', [ __CLASS__, 'setup_default_capabilities' ] );
	}

	/**
	 * Check if the current user has permission to sync an entity.
	 *
	 * @param string      $entity_type The entity type (e.g., 'postType/post').
	 * @param string      $entity_id   The entity ID.
	 * @param string|null $action      The action being performed (unused, kept for compatibility).
	 */
	public static function check_permission(
		string $entity_type,
		string $entity_id,
		?string $action = null
	): WP_Error|bool {
		$user_check_result = self::check_current_user();
		if ( is_wp_error( $user_check_result ) ) {
			return $user_check_result;
		}

		// Parse entity type
		$parts = explode( '/', $entity_type, 2 );
		if ( count( $parts ) !== 2 ) {
			return new WP_Error(
				'invalid_entity',
				__( 'Invalid entity type format', 'vip-realtime-collaboration' )
			);
		}

		[ $kind, $name ] = $parts;

		// Only handle post types now
		if ( 'postType' === $kind ) {
			/**
			 * For post entities, we only need the entity ID (post ID) for permission checking.
			 * The $name is Gutenberg's entity name which maps to post type name instead of post type slug,
			 * but we can determine the post type directly from the post ID.
			 */
			return self::check_post_sync_permission( $entity_id );
		}

		// Allow extensions to handle other entity types via filter
		return self::check_custom_sync_permission( $kind, $name, $entity_id );
	}

	/**
	 * Check if the current user is logged in and has a valid user ID.
	 *
	 * @return WP_Error|bool True if the user is logged in and has a valid user ID, otherwise a WP_Error.
	 */
	private static function check_current_user(): WP_Error|bool {
		// Check if user is logged in
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'user_not_logged_in',
				__( 'User is not logged in.', 'vip-real-time-collaboration' )
			);
		}

		$current_user = wp_get_current_user();

		// Check if user ID is valid (not 0)
		if ( 0 === $current_user->ID ) {
			return new \WP_Error(
				'invalid_user_id',
				__( 'Invalid user.', 'vip-real-time-collaboration' )
			);
		}

		return true;
	}

	/**
	 * Allow customizing the permission check for a specific post
	 * or a specific post type (by fetching post and checking its type)
	 *
	 * @param string $entity_id The entity ID.
	 */
	private static function check_post_sync_permission(
		string $entity_id
	): WP_Error|bool {
		// Validate post ID format
		if ( ! is_numeric( $entity_id ) ) {
			return new WP_Error(
				'invalid_post_id',
				__( 'Post ID must be numeric', 'vip-realtime-collaboration' )
			);
		}

		/** @var int $post_id */
		$post_id = absint( $entity_id );

		// Check sync_post capability (will be mapped to edit_post via map_meta_cap)
		if ( ! current_user_can( 'sync_post', $post_id ) ) {
			return new WP_Error(
				'insufficient_sync_permissions',
				__( 'You do not have permission to sync this content', 'vip-realtime-collaboration' )
			);
		}

		/**
		 * Allow customizing the permission check for a specific post type.
		 *
		 * @param bool|WP_Error $result The result of the permission check.
		 * @param int          $post_id The post ID.
		 */
		$result = apply_filters(
			'vip_rtc_post_sync_check_permission',
			true,
			$post_id
		);

		return $result;
	}

	/**
	 * Check permission for custom entity types via filters.
	 *
	 * @param string      $entity_kind The entity kind
	 * @param string      $entity_name The entity name.
	 * @param string      $entity_id   The entity ID.
	 */
	private static function check_custom_sync_permission(
		string $entity_kind,
		string $entity_name,
		string $entity_id
	): WP_Error|bool {
		/**
		 * Allow customizing the permission check for a specific entity type.
		 *
		 * @param bool|WP_Error $result The result of the permission check.
		 * @param string       $entity_kind The entity kind.
		 * @param string       $entity_name The entity name.
		 * @param string       $entity_id The entity ID.
		 */
		$result = apply_filters(
			'vip_rtc_entity_sync_check_permission',
			true,
			$entity_kind,
			$entity_name,
			$entity_id
		);

		return $result;
	}

	/**
	 * Map sync capabilities to WordPress post capabilities.
	 *
	 * @param string[] $caps    Primitive capabilities required.
	 * @param string   $cap     Capability being mapped.
	 * @param int      $user_id User ID.
	 * @param array    $args    Additional arguments.
	 * @return string[] Mapped capabilities.
	 * @psalm-suppress PossiblyUnusedReturnValue
	 */
	public static function map_sync_capabilities( array $caps, string $cap, int $user_id, array $args ): array {
		// Handle sync_post capability
		if ( 'sync_post' === $cap ) {
			/** @var int $post_id */
			$post_id = $args[0] ?? 0;

			// Map to edit_post capability with the same arguments
			return map_meta_cap( 'edit_post', $user_id, $post_id );
		}

		return $caps;
	}

	/**
	 * Set up default sync capabilities for WordPress roles.
	 */
	public static function setup_default_capabilities(): void {
		// Give sync_post capability to roles that can edit posts
		$roles_to_update = [ 'administrator', 'editor', 'author', 'contributor' ];

		foreach ( $roles_to_update as $role_name ) {
			$role = get_role( $role_name );
			if ( $role && ! $role->has_cap( 'sync_post' ) ) {
				$role->add_cap( 'sync_post' );
			}
		}
	}
}
