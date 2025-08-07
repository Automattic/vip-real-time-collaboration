<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Auth;

use Ahc\Jwt\JWT;
use VIPRealTimeCollaboration\Auth\SyncPermissions;
use WP_Error;

defined( 'ABSPATH' ) || exit();

/**
 * Handles WebSocket authentication for real-time collaboration.
 */
final class WebSocketAuth {
	/**
	 * Generate a JWT token for the current user with entity permissions.
	 *
	 * @param string $entity_type Optional entity type to include in token.
	 * @param string $entity_id Optional entity ID to include in token.
	 *
	 * @return string|WP_Error The JWT token or WP_Error if generation fails.
	 */
	public static function generate_token( string $entity_type, string $entity_id ): string|WP_Error {
		$permission_check = SyncPermissions::can_sync( $entity_type, $entity_id );
		if ( true !== $permission_check ) {
			if ( is_wp_error( $permission_check ) ) {
				return $permission_check;
			}
			return new WP_Error(
				'permission_denied',
				__( 'User does not have permission to access this entity.', 'vip-real-time-collaboration' )
			);
		}

		$current_user = wp_get_current_user();

		// Get the JWT secret from constant
		if ( defined( 'VIP_RTC_WS_AUTH_SECRET' ) ) {
			$jwt_secret = (string) constant( 'VIP_RTC_WS_AUTH_SECRET' );
		} else {
			return new WP_Error(
				'missing_jwt_secret',
				__( 'VIP_RTC_WS_AUTH_SECRET is not defined.', 'vip-real-time-collaboration' )
			);
		}

		// Prepare the payload
		$payload = [
			'user_id' => $current_user->ID,
			'username' => $current_user->user_login,
			'entity_type' => $entity_type,
			'entity_id' => $entity_id,
			'iat' => time(), // Issued at
			'exp' => time() + 30, // Expires in 30 seconds
		];

		// Generate JWT token
		try {
			$jwt = new JWT( $jwt_secret, 'HS256' );
			return $jwt->encode( $payload );
		} catch ( \Exception $e ) {
			return new WP_Error(
				'jwt_generation_failed',
				sprintf(
					/* translators: %s: error message */
					__( 'Failed to generate JWT token: %s', 'vip-real-time-collaboration' ),
					$e->getMessage()
				)
			);
		}
	}
}
