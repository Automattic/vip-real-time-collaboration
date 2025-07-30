<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\API;

defined( 'ABSPATH' ) || exit();

use VIPRealtimeCollaboration\Auth\WebSocketAuth;
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
				'methods' => 'GET',
				'callback' => [ $this, 'get_auth_token' ],
				'permission_callback' => [ $this, 'get_auth_token_permissions_check' ],
			]
		);
	}

	/**
	 * Get a WebSocket authentication token.
	 *
	 * @param WP_REST_Request $_request Full details about the request.
	 * @return WP_REST_Response|WP_Error Response object on success, or WP_Error object on failure.
	 * @psalm-suppress PossiblyUnusedMethod
	 */
	public function get_auth_token( WP_REST_Request $_request ): WP_REST_Response|WP_Error {
		// Generate a short-lived token
		$token = WebSocketAuth::generate_token();

		if ( null === $token ) {
			return new WP_Error(
				'token_generation_failed',
				__( 'Failed to generate authentication token.', 'vip-realtime-collaboration' ),
				[ 'status' => 500 ]
			);
		}

		return rest_ensure_response(
			[
				'token' => $token,
				'expires_in' => 30, // seconds
			]
		);
	}

	/**
	 * Check if the current user has permission to get an auth token.
	 *
	 * @param WP_REST_Request $_request Full details about the request.
	 * @return bool|WP_Error True if the request has access, WP_Error object otherwise.
	 * @psalm-suppress PossiblyUnusedMethod
	 */
	public function get_auth_token_permissions_check( WP_REST_Request $_request ): bool|WP_Error {
		/**
		 * TODO: Add permission check for the user to verify they have access to post for
		 * which the websocket access token is being requested.
		 */
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'rest_forbidden',
				__( 'You must be logged in to access this endpoint.', 'vip-realtime-collaboration' ),
				[ 'status' => 401 ]
			);
		}

		return true;
	}
}
