<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Auth;

use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * Handles permission checking for sync objects using custom sync capabilities
 */
final class SyncPermissions {
	/**
	 * Initialize custom sync capabilities.
	 * Sets up meta capability mapping and role capabilities.
	 */
	public static function init(): void {
		add_filter( 'map_meta_cap', [ __CLASS__, 'map_sync_capabilities' ], 10, 4 );
		add_action( 'init', [ __CLASS__, 'setup_default_capabilities' ] );
	}

	/**
	 * Check if the current user can sync the specified object.
	 *
	 * @param string $sync_object_type The sync object type in format 'entity_kind/entity_name' (e.g., 'postType/Posts').
	 * @param string $sync_object_id   The sync object ID (e.g., post ID).
	 */
	public static function can_sync(
		string $sync_object_type,
		string $sync_object_id,
	): WP_Error|bool {
		$user_check_result = self::check_current_user();
		/** @psalm-suppress RedundantCondition -- Keep the WordPress API type guard at this boundary. */
		if ( is_wp_error( $user_check_result ) ) {
			return $user_check_result;
		}

		// Parse sync object type (format: kind/name)
		$parts = explode( '/', $sync_object_type, 2 );
		if ( count( $parts ) !== 2 ) {
			return new WP_Error(
				'invalid_sync_object_type',
				__( 'Invalid sync object type format. Expected: entity_kind/entity_name', 'vip-real-time-collaboration' )
			);
		}

		// Extract Gutenberg entity kind and name from sync object type
		[ $entity_kind, $entity_name ] = $parts;

		// Handle post type entities (not collections)
		if ( 'postType' === $entity_kind && 'collection' !== $sync_object_id ) {
			return self::check_post_sync_permissions( $entity_name, $sync_object_id );
		}

		// Allow extensions to handle other sync object types via filter
		return self::check_custom_sync_permissions( $entity_kind, $entity_name, $sync_object_id );
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
			return new WP_Error(
				'invalid_user_id',
				__( 'Invalid user.', 'vip-real-time-collaboration' )
			);
		}

		return true;
	}

	/**
	 * Check sync permission for a specific post.
	 *
	 * @param string $post_type The expected post type.
	 * @param string $post_id The post ID.
	 */
	private static function check_post_sync_permissions(
		string $post_type,
		string $post_id
	): WP_Error|bool {
		/** @var int $parsed_post_id */
		$parsed_post_id = absint( $post_id );

		// Validate that the ID is a canonical positive integer.
		if ( 0 === $parsed_post_id || (string) $parsed_post_id !== $post_id ) {
			return new WP_Error(
				'invalid_post_id',
				__( 'Post ID must be numeric', 'vip-real-time-collaboration' )
			);
		}

		if ( get_post_type( $parsed_post_id ) !== $post_type ) {
			return new WP_Error(
				'insufficient_sync_permissions',
				__( 'You do not have permission to sync this content', 'vip-real-time-collaboration' )
			);
		}

		// Check sync_post capability (will be mapped to edit_post via map_meta_cap)
		/** @var bool|WP_Error $can_sync_post */
		$can_sync_post = true;
		if ( ! current_user_can( 'sync_post', $parsed_post_id ) ) {
			$can_sync_post = new WP_Error(
				'insufficient_sync_permissions',
				__( 'You do not have permission to sync this content', 'vip-real-time-collaboration' )
			);
		}

		/**
		 * Allow customizing the permission check for a specific post.
		 *
		 * @param bool|WP_Error $result  The result of the permission check.
		 * @param int           $post_id The post ID.
		 */
		/** @var bool|WP_Error */
		return apply_filters(
			'vip_rtc_post_sync_check_permission',
			$can_sync_post,
			$parsed_post_id
		);
	}

	/**
	 * Check permission for collection and custom sync object types.
	 *
	 * @param string $entity_kind The Gutenberg entity kind (e.g., 'postType', 'root').
	 * @param string $entity_name The Gutenberg entity name (e.g., 'post', 'site').
	 * @param string $entity_id   The Gutenberg entity ID or 'collection'.
	 */
	private static function check_custom_sync_permissions(
		string $entity_kind,
		string $entity_name,
		string $entity_id
	): WP_Error|bool {
		$can_sync_entity = false;

		if ( 'collection' === $entity_id && 'postType' === $entity_kind ) {
			$post_type = get_post_type_object( $entity_name );
			/** @var string|null $edit_posts_capability */
			$edit_posts_capability = $post_type?->cap->edit_posts ?? null;

			if ( is_string( $edit_posts_capability ) && current_user_can( $edit_posts_capability ) ) {
				$can_sync_entity = true;
			}
		} elseif (
			'collection' === $entity_id
			&& (
				( 'root' === $entity_kind && 'comment' === $entity_name )
				|| ( 'taxonomy' === $entity_kind && taxonomy_exists( $entity_name ) )
			)
			&& self::current_user_can_edit_rest_post_type()
		) {
			$can_sync_entity = true;
		}

		/**
		 * Allow customizing the permission check for a specific sync object type.
		 *
		 * @param bool|WP_Error $result            The result of the permission check.
		 * @param string        $entity_kind       The Gutenberg entity kind.
		 * @param string        $entity_name       The Gutenberg entity name.
		 * @param string        $entity_id    The Gutenberg entity ID (e.g. '12' for postType).
		 */
		/** @var bool|WP_Error $permission_check */
		$permission_check = apply_filters(
			'vip_rtc_entity_sync_check_permission',
			$can_sync_entity,
			$entity_kind,
			$entity_name,
			$entity_id
		);

		if ( false === $permission_check ) {
			return new WP_Error(
				'insufficient_sync_permissions',
				__( 'You do not have permission to sync this content', 'vip-real-time-collaboration' )
			);
		}

		return $permission_check;
	}

	/**
	 * Check whether the current user can edit a post type exposed through the REST API.
	 *
	 * Shared comment and taxonomy collection rooms do not identify a specific post, so
	 * use the registered post type capabilities instead of the global edit_posts cap.
	 */
	private static function current_user_can_edit_rest_post_type(): bool {
		/** @var \WP_Post_Type[] $post_types */
		$post_types = get_post_types( [ 'show_in_rest' => true ], 'objects' );

		foreach ( $post_types as $post_type ) {
			/** @var string|null $edit_posts_capability */
			$edit_posts_capability = $post_type->cap->edit_posts ?? null;

			if ( is_string( $edit_posts_capability ) && current_user_can( $edit_posts_capability ) ) {
				return true;
			}
		}

		return false;
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
			$post_id = $args[0];

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
