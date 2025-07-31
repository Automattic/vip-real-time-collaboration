<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\Auth;

use Firebase\JWT\JWT;

defined( 'ABSPATH' ) || exit();

/**
 * Handles WebSocket authentication for real-time collaboration.
 */
final class WebSocketAuth {
	/**
	 * Generate a JWT token for the current user.
	 *
	 * @return string|null The JWT token or null if user is not logged in.
	 */
	public static function generate_token(): ?string {
		// Check if user is logged in
		if ( ! is_user_logged_in() ) {
			return null;
		}

		$current_user = wp_get_current_user();
		
		// Get the JWT secret from constant with fallback
		$jwt_secret = defined( 'RTC_WEBSOCKET_AUTH_SECRET' ) ? (string) constant( 'RTC_WEBSOCKET_AUTH_SECRET' ) : 'rtc_websocket_auth_secret';

		// Prepare the payload
		$payload = [
			'user_id' => $current_user->ID,
			'username' => $current_user->user_login,
			'email' => $current_user->user_email,
			'display_name' => $current_user->display_name,
			'iat' => time(), // Issued at
			'exp' => time() + 30, // Expires in 30 seconds
		];

		// Generate JWT token
		try {
			return JWT::encode( $payload, $jwt_secret, 'HS256' );
		} catch ( \Exception $e ) {
			return null;
		}
	}
}
