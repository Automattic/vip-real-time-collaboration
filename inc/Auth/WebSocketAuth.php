<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\Auth;

use Ahc\Jwt\JWT;

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
	 * @return string|null The JWT token or null if user is not logged in or lacks permission.
	 */
	public static function generate_token( string $entity_type, string $entity_id ): ?string {
		// Check if user is logged in
		if ( ! is_user_logged_in() ) {
			return null;
		}

		$current_user = wp_get_current_user();

		// Get the JWT secret from constant
		if ( defined( 'RTC_WEBSOCKET_AUTH_SECRET' ) ) {
			$jwt_secret = (string) constant( 'RTC_WEBSOCKET_AUTH_SECRET' );
		} else {
			// Log error for debugging
			if ( defined( 'WP_DEBUG' ) ) {
				// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
				error_log( 'VIP RTC: RTC_WEBSOCKET_AUTH_SECRET is not defined' );
			}

			return null;
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
			// Log error for debugging
			if ( defined( 'WP_DEBUG' ) ) {
				// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
				error_log( 'VIP RTC: Failed to generate JWT token: ' . esc_html( $e->getMessage() ) );
			}
			return null;
		}
	}
}
