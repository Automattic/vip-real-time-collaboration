<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Api;

defined( 'ABSPATH' ) || exit();

use WP_REST_Controller;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * REST API controller for telemetry endpoints.
 */
final class TelemetryApiController extends WP_REST_Controller {
	public function __construct() {
		$this->namespace = RestApi::NAMESPACE;
		$this->rest_base = '/telemetry';
		$this->schema = [];
	}

	/**
	 * Register REST API routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			$this->rest_base . '/session-stats',
			[
				'methods' => 'POST',
				'callback' => [ $this, 'log_session_stats' ],
				'permission_callback' => [ $this, 'log_session_stats_permissions_check' ],
				'args' => [
					'postId' => [
						'description' => __( 'The post ID', 'vip-real-time-collaboration' ),
						'type' => [ 'integer', 'string', 'null' ],
						'required' => true,
					],
					'sessionDuration' => [
						'description' => __( 'Session duration in seconds', 'vip-real-time-collaboration' ),
						'type' => 'integer',
						'required' => true,
						'minimum' => 0,
					],
					'sessionTimeLastActivity' => [
						'description' => __( 'Last activity timestamp in milliseconds', 'vip-real-time-collaboration' ),
						'type' => [ 'integer', 'null' ],
						'required' => false,
					],
					'sessionTimeStart' => [
						'description' => __( 'Session start timestamp in milliseconds', 'vip-real-time-collaboration' ),
						'type' => [ 'integer', 'null' ],
						'required' => false,
					],
					'timestamp' => [
						'description' => __( 'Session end timestamp in milliseconds', 'vip-real-time-collaboration' ),
						'type' => 'integer',
						'required' => true,
					],
					'usersActive' => [
						'description' => __( 'Number of active users in the session', 'vip-real-time-collaboration' ),
						'type' => 'integer',
						'required' => true,
						'minimum' => 0,
					],
					'usersInactive' => [
						'description' => __( 'Number of inactive users in the session', 'vip-real-time-collaboration' ),
						'type' => 'integer',
						'required' => true,
						'minimum' => 0,
					],
					'usersMax' => [
						'description' => __( 'Number of users in the session', 'vip-real-time-collaboration' ),
						'type' => 'integer',
						'required' => true,
						'minimum' => 0,
					],
				],
			]
		);
	}

	/**
	 * Log session statistics to Pendo.
	 *
	 * @param WP_REST_Request $request Full details about the request.
	 * @return WP_REST_Response|WP_Error Response object on success, or WP_Error object on failure.
	 *
	 * @psalm-suppress PossiblyUnusedMethod
	 */
	public function log_session_stats( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		// Check if VIP Telemetry Library is available.
		if ( ! class_exists( '\Automattic\VIP\Telemetry\Pendo' ) ) {
			return new WP_Error(
				'telemetry_unavailable',
				__( 'VIP Telemetry Library (Pendo) is not available', 'vip-real-time-collaboration' ),
				[ 'status' => 503 ]
			);
		}

		$session_stats = [
			'post_id' => $request->get_param( 'postId' ),
			'session_duration' => $request->get_param( 'sessionDuration' ),
			'timestamp' => $request->get_param( 'timestamp' ),
			'users_active' => $request->get_param( 'usersActive' ),
			'users_inactive' => $request->get_param( 'usersInactive' ),
			'users_max' => $request->get_param( 'usersMax' ),
		];

		// Add optional fields if present.
		$optional_fields = [
			'sessionTimeStart' => 'session_time_start',
			'sessionTimeLastActivity' => 'session_time_last_activity',
		];
		foreach ( $optional_fields as $camel_case => $snake_case ) {
			$value = $request->get_param( $camel_case );
			if ( null !== $value ) {
				$session_stats[ $snake_case ] = $value;
			}
		}

		// Use VIP Telemetry Library to record event.
		$pendo = new \Automattic\VIP\Telemetry\Pendo();
		$result = $pendo->record_event( 'real_time_collaboration_session', $session_stats );

		if ( is_wp_error( $result ) ) {
			return new WP_Error(
				'telemetry_error',
				$result->get_error_message(),
				[ 'status' => 500 ]
			);
		}

		if ( ! $result ) {
			return new WP_Error(
				'telemetry_failed',
				__( 'Failed to record telemetry event', 'vip-real-time-collaboration' ),
				[ 'status' => 500 ]
			);
		}

		return rest_ensure_response( [
			'success' => true,
			'message' => __( 'Session statistics logged successfully', 'vip-real-time-collaboration' ),
		] );
	}

	/**
	 * Check if the current user has permission to log session statistics.
	 *
	 * @param WP_REST_Request $_request Full details about the request.
	 * @return bool|WP_Error True if the request has access, WP_Error object otherwise.
	 *
	 * @psalm-suppress PossiblyUnusedMethod
	 */
	public function log_session_stats_permissions_check( WP_REST_Request $_request ): bool|WP_Error {
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'rest_forbidden',
				__( 'You must be logged in to log session statistics.', 'vip-real-time-collaboration' ),
				[ 'status' => 401 ]
			);
		}

		$post_id = $_request->get_param( 'postId' );

		if ( false === filter_var( $post_id, FILTER_VALIDATE_INT ) || intval( $post_id ) <= 0 ) {
			return new WP_Error(
				'invalid_post_id',
				__( 'Invalid post ID provided.', 'vip-real-time-collaboration' ),
				[ 'status' => 400 ]
			);
		}

		if ( ! current_user_can( 'read_post', $post_id ) ) {
			return new WP_Error(
				'rest_forbidden',
				__( 'You do not have permission to log session statistics.', 'vip-real-time-collaboration' ),
				[ 'status' => 403 ]
			);
		}

		return true;
	}
}
