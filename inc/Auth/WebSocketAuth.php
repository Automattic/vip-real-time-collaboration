<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\Auth;

defined( 'ABSPATH' ) || exit();

/**
 * Handles WebSocket authentication for real-time collaboration.
 */
class WebSocketAuth {
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
		$jwt_secret = defined( 'RTC_WEBSOCKET_AUTH_SECRET' ) ? constant( 'RTC_WEBSOCKET_AUTH_SECRET' ) : 'rtc_websocket_auth_secret';

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
			// Create base64url encode function
			$base64url_encode = function ( $data ) {
				return rtrim( strtr( base64_encode( $data ), '+/', '-_' ), '=' );
			};
			
			// Create header
			$header = $base64url_encode( wp_json_encode( [
				'alg' => 'HS256',
				'typ' => 'JWT',
			] ) );
			
			// Create payload
			$payload_encoded = $base64url_encode( wp_json_encode( $payload ) );
		
			// Create signature
			$signature_input = $header . '.' . $payload_encoded;
			$signature = $base64url_encode( hash_hmac( 'sha256', $signature_input, $jwt_secret, true ) );
			
			// Return complete JWT
			return $signature_input . '.' . $signature;
		} catch ( \Exception $e ) {
			return null;
		}
	}
}
