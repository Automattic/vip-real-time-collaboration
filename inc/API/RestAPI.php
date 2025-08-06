<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\API;

defined( 'ABSPATH' ) || exit();

use VIPRealTimeCollaboration\Auth\EntityPermissions;
use VIPRealTimeCollaboration\Auth\WebSocketAuth;
use WP_REST_Controller;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * REST API controller for WebSocket authentication.
 */
final class RestAPI extends WP_REST_Controller {

	public function __construct() {
		$this->namespace = 'vip-rtc/v1';
		$this->rest_base = 'websocket';
		$this->schema = [];

		add_action( 'rest_api_init', [ $this, 'register_routes' ], 10, 0 );
	}

	/**
	 * Register REST API routes.
	 */
	#[\Override]
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/auth',
			[
				'methods' => 'POST',
				'callback' => [ $this, 'get_auth_token' ],
				'permission_callback' => [ $this, 'get_auth_token_permissions_check' ],
				'args' => [
					'syncObjectType' => [
						'description' => __(
							'The entity type for synchronization (e.g., postType/post, root/base)',
							'vip-real-time-collaboration'
						),
						'type' => 'string',
						'required' => true,
						'sanitize_callback' => 'sanitize_text_field',
						'validate_callback' => [ $this, 'validate_entity_type' ],
					],
					'syncObjectId' => [
						'description' => __(
							'The entity ID for synchronization',
							'vip-real-time-collaboration'
						),
						'type' => 'string',
						'required' => true,
						'sanitize_callback' => 'sanitize_text_field',
					],
				],
			]
		);
	}

	/**
	 * Validate entity type format.
	 *
	 * @param mixed           $value   The value to validate.
	 * @param WP_REST_Request $_request The request object.
	 * @param string          $_param   The parameter name.
	 * @return bool True if valid, false otherwise.
	 * 
	 * @psalm-suppress PossiblyUnusedMethod
	 */
	public function validate_entity_type(
		mixed $value,
		WP_REST_Request $_request,
		string $_param
	): bool {
		if ( ! is_string( $value ) ) {
			return false;
		}

		// Entity type should be in format: kind/name
		$parts = explode( '/', $value );
		return 2 === count( $parts ) && '' !== $parts[0] && '' !== $parts[1];
	}

	/**
	 * Get a WebSocket authentication token.
	 *
	 * @param WP_REST_Request $request Full details about the request.
	 * @return WP_REST_Response|WP_Error Response object on success, or WP_Error object on failure.
	 * 
	 * @psalm-suppress PossiblyUnusedMethod
	 */
	public function get_auth_token( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$entity_type = $request->get_param( 'syncObjectType' );
		$entity_id = $request->get_param( 'syncObjectId' );

		// Validate parameter types
		if ( ! is_string( $entity_type ) || ! is_string( $entity_id ) ) {
			return new WP_Error(
				'invalid_parameters',
				__( 'syncObjectType and syncObjectId must be strings.', 'vip-real-time-collaboration' ),
				[ 'status' => 400 ]
			);
		}

		// Generate a short-lived token with entity information
		$token = WebSocketAuth::generate_token( $entity_type, $entity_id );

		if ( is_wp_error( $token ) ) {
			// Log error for debugging
			/** @psalm-suppress TypeDoesNotContainType */
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
				error_log( 'VIP RTC: WebSocket auth token generation failed: ' . $token->get_error_message() );
			}

			return new WP_Error(
				'token_generation_failed',
				__( 'Failed to generate authentication token.', 'vip-real-time-collaboration' ),
				[ 'status' => 500 ]
			);
		}

		return rest_ensure_response(
			[
				'token' => $token,
				'expires_in' => 30, // seconds
				'room_name' => sprintf( '%s-%s', $entity_type, $entity_id ),
			]
		);
	}

	/**
	 * Check if the current user has permission to get an auth token.
	 *
	 * @param WP_REST_Request $request Full details about the request.
	 * @return bool|WP_Error True if the request has access, WP_Error object otherwise.
	 * 
	 * @psalm-suppress PossiblyUnusedMethod
	 */
	public function get_auth_token_permissions_check( WP_REST_Request $request ): bool|WP_Error {
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'rest_forbidden',
				__( 'You must be logged in to access this endpoint.', 'vip-real-time-collaboration' ),
				[ 'status' => 401 ]
			);
		}

		// Check entity permissions
		$entity_type = $request->get_param( 'syncObjectType' );
		$entity_id = $request->get_param( 'syncObjectId' );

		// Validate required parameters
		if (
			! is_string( $entity_type )
			|| ! is_string( $entity_id )
			|| empty( $entity_type )
			|| empty( $entity_id )
		) {
			return new WP_Error(
				'missing_parameters',
				__( 'syncObjectType and syncObjectId are required.', 'vip-real-time-collaboration' ),
				[ 'status' => 400 ]
			);
		}

		$permission_check = EntityPermissions::check_permission( $entity_type, $entity_id );
		if ( true !== $permission_check ) {
			$error_message = is_wp_error( $permission_check ) ? $permission_check->get_error_message() : __( 'Permission denied', 'vip-real-time-collaboration' );
			return new WP_Error(
				'rest_forbidden',
				$error_message,
				[ 'status' => 401 ]
			);
		}

		return true;
	}
}
