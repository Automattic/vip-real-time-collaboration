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
	 * Generate a JWT token for the current user with sync room name.
	 *
	 * @param string $sync_object_type Optional sync object type to include in token.
	 * @param string $sync_object_id Optional sync object ID to include in token.
	 *
	 * @return string|WP_Error The JWT token or WP_Error if generation fails.
	 */
	public static function generate_token( string $sync_object_type, string $sync_object_id ): string|WP_Error {
		$permission_check = SyncPermissions::can_sync( $sync_object_type, $sync_object_id );
		if ( true !== $permission_check ) {
			if ( is_wp_error( $permission_check ) ) {
				return new WP_Error(
					'permission_denied',
					$permission_check->get_error_message()
				);
			}
			/**
			 * Unlikely to happen, as can_sync() should return a WP_Error or true.
			 */
			return new WP_Error(
				'permission_denied',
				__( 'User does not have sufficient permissions.', 'vip-real-time-collaboration' )
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

		$expires = time() + self::get_token_expire_seconds();

		// Prepare the payload
		$payload = [
			'user_id' => $current_user->ID,
			'username' => $current_user->user_login,
			'room_name' => sprintf( '%s-%s', $sync_object_type, $sync_object_id ),
			'iat' => time(), // Issued at
			'exp' => $expires,
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

	public static function get_token_expire_seconds(): int {
		$is_production = constant( 'VIP_GO_APP_ENVIRONMENT' ) && constant( 'VIP_GO_APP_ENVIRONMENT' ) === 'production';

		if ( $is_production === false && constant( 'WP_DEBUG' ) === true && intval( constant( 'VIP_RTC_WS_AUTH_TOKEN_EXPIRE_SECONDS' ) ) > 0 ) {
			return intval( constant( 'VIP_RTC_WS_AUTH_TOKEN_EXPIRE_SECONDS' ) );
		}

		return 30;
	}
}
