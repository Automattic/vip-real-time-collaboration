<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Auth;

use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * WordPress Entity Permissions Handler
 *
 * Handles permission checking for entities in the format kind/name
 */
final class EntityPermissions {

	/**
	 * Capability mappings for root entities
	 */
	private const ROOT_CAPABILITIES = [
		'base' => 'manage_options',      // Site settings
		'site' => 'edit_theme_options',  // Global styles/theme settings
		'postType' => 'read',            // Post type definitions
	];

	/**
	 * Check if the current user has permission to access an entity.
	 *
	 * @param string      $entity_type The entity type (e.g., 'postType/post', 'root/base').
	 * @param string      $entity_id   The entity ID.
	 * @param string|null $action      The action being performed.
	 */
	public static function check_permission(
		string $entity_type,
		string $entity_id,
		?string $action = null
	): WP_Error|bool {
		// Parse entity type
		$parts = explode( '/', $entity_type, 2 );
		if ( count( $parts ) !== 2 ) {
			return new WP_Error(
				'invalid_entity',
				__( 'Invalid entity type format', 'vip-realtime-collaboration' )
			);
		}

		[ $kind, $name ] = $parts;

		return match ( $kind ) {
			'postType' => self::check_post_type_permission( $name, $entity_id, $action ),
			'root' => self::check_root_permission( $name ),
			default => self::check_custom_permission( $entity_type, $entity_id, $action ),
		};
	}

	/**
	 * Check permission for post type entities.
	 *
	 * @param string $post_type The post type name.
	 * @param string $entity_id The entity ID.
	 * @param string $action    The action being performed.
	 */
	private static function check_post_type_permission(
		string $post_type,
		string $entity_id,
		?string $action
	): WP_Error|bool {
		// Validate post ID format
		if ( ! is_numeric( $entity_id ) ) {
			return new WP_Error(
				'invalid_post_id',
				__( 'Post ID must be numeric', 'vip-realtime-collaboration' )
			);
		}

		// Map action to WordPress capability
		$capability = match ( $action ) {
			'read' => 'read_post',
			'delete' => 'delete_post',
			default => 'edit_post',
		};

		if ( ! current_user_can( $capability, absint( $entity_id ) ) ) {
			return new WP_Error(
				'insufficient_permissions',
				sprintf(
					/* translators: %s: the action being performed (e.g., edit, read, delete) */
					__( 'You do not have permission to %s this content', 'vip-realtime-collaboration' ),
					$action ?? __( 'edit', 'vip-realtime-collaboration' )
				)
			);
		}

		return true;
	}

	/**
	 * Check permission for root entities.
	 *
	 * Currently, this seems to be used for sync for following entities:
	 * - root/base
	 * - root/site
	 * - root/postType
	 *
	 * @TODO: Investigate if this check should be stricter to check for edit capabilities
 * like manage_options, edit_theme_options, etc. instead of just read.
	 *
	 * @param string $root_entity The root entity name.
	 */
	private static function check_root_permission( string $entity_type ): WP_Error|bool {
		$capability = 'read';

		if ( ! current_user_can( $capability ) ) {
			return new WP_Error(
				'insufficient_permissions',
				sprintf(
					/* translators: %s: the root entity name (e.g., base, site, postType) */
					__( 'You do not have permission to access %s settings', 'vip-realtime-collaboration' ),
					$root_entity
				)
			);
		}

		return true;
	}

	/**
	 * Check permission for custom entity types via filters.
	 *
	 * @param string $entity_type The full entity type.
	 * @param string $entity_id   The entity ID.
	 * @param string|null $action      The action being performed.
	 */
	private static function check_custom_permission(
		string $entity_type,
		string $entity_id,
		?string $action = null
	): WP_Error|bool {
		// Allow extensions to handle custom entity types
		$result = apply_filters(
			'vip_rtc_entity_check_permission',
			null,
			$entity_type,
			$entity_id,
			$action
		);

		if ( null !== $result ) {
			return is_wp_error( $result ) ? $result : true;
		}

		// Extract kind from entity_type for error message
		$kind = explode( '/', $entity_type )[0];
		return new WP_Error(
			'unknown_entity_kind',
			sprintf(
				/* translators: %s: the entity kind (e.g., postType, root, custom) */
				__( 'Unknown entity kind: %s', 'vip-realtime-collaboration' ),
				$kind
			)
		);
	}
}
