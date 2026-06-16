<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration\Api;

use VIPRealTimeCollaboration\Api\TelemetryApiController;
use WP_REST_Request;
use WP_UnitTestCase;

use function add_action;
use function remove_all_actions;
use function wp_set_current_user;

final class TelemetryApiControllerTest extends WP_UnitTestCase {
	private TelemetryApiController $controller;

	protected function setUp(): void {
		parent::setUp();
		$this->controller = new TelemetryApiController();
	}

	protected function tearDown(): void {
		remove_all_actions( 'vip_real_time_collaboration_track_event' );
		parent::tearDown();
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Api\TelemetryApiController::record_limit_dialog_shown
	 */
	public function test_record_limit_dialog_shown_fires_track_event_action(): void {
		$received = [];
		add_action(
			'vip_real_time_collaboration_track_event',
			static function ( string $event, array $props ) use ( &$received ): void {
				$received[] = [ $event, $props ];
			},
			10,
			2
		);

		$request = new WP_REST_Request( 'POST', '/vip-rtc/v1/telemetry/limit-dialog' );

		$response = $this->controller->record_limit_dialog_shown( $request );

		self::assertSame( 200, $response->get_status() );
		self::assertSame( [ 'recorded' => true ], $response->get_data() );
		self::assertCount( 1, $received );
		self::assertSame( 'collaborator_limit_dialog_shown', $received[0][0] );
		self::assertSame( [], $received[0][1] );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Api\TelemetryApiController::permissions_check
	 */
	public function test_permissions_check_rejects_users_without_edit_posts(): void {
		$user_id = self::factory()->user->create( [ 'role' => 'subscriber' ] );
		wp_set_current_user( $user_id );

		$result = $this->controller->permissions_check( new WP_REST_Request( 'POST' ) );

		self::assertInstanceOf( \WP_Error::class, $result );
		self::assertSame( 'rest_forbidden', $result->get_error_code() );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Api\TelemetryApiController::permissions_check
	 */
	public function test_permissions_check_rejects_unauthenticated_users(): void {
		wp_set_current_user( 0 );

		$result = $this->controller->permissions_check( new WP_REST_Request( 'POST' ) );

		self::assertInstanceOf( \WP_Error::class, $result );
		self::assertSame( 'rest_forbidden', $result->get_error_code() );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Api\TelemetryApiController::permissions_check
	 */
	public function test_permissions_check_allows_users_who_can_edit_posts(): void {
		$user_id = self::factory()->user->create( [ 'role' => 'editor' ] );
		wp_set_current_user( $user_id );

		$result = $this->controller->permissions_check( new WP_REST_Request( 'POST' ) );

		self::assertTrue( $result );
	}
}
