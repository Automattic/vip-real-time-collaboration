<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration\Api;

use VIPRealTimeCollaboration\Api\AuthApiController;
use WP_Error;
use WP_REST_Request;
use WP_UnitTestCase;

use function rest_convert_error_to_response;
use function wp_set_current_user;

final class AuthApiControllerTest extends WP_UnitTestCase {
	/**
	 * @covers \VIPRealTimeCollaboration\Api\AuthApiController::get_auth_token
	 */
	public function test_permission_denial_has_rest_error_status(): void {
		$post_id = self::factory()->post->create();
		$subscriber_id = self::factory()->user->create( [ 'role' => 'subscriber' ] );
		wp_set_current_user( $subscriber_id );

		$request = new WP_REST_Request( 'POST', '/vip-rtc/v1/websocket/auth' );
		$request->set_param( 'syncObjectType', 'postType/post' );
		$request->set_param( 'syncObjectId', (string) $post_id );
		$request->set_param( 'wpClientId', 'test-client' );

		$error = ( new AuthApiController() )->get_auth_token( $request );
		self::assertInstanceOf( WP_Error::class, $error );
		self::assertSame( 'permission_denied', $error->get_error_code() );
		self::assertSame( [ 'status' => 403 ], $error->get_error_data() );

		$response = rest_convert_error_to_response( $error );
		self::assertSame( 403, $response->get_status() );
		self::assertSame( 403, $response->get_data()['data']['status'] );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Api\AuthApiController::get_auth_token_permissions_check
	 */
	public function test_logged_out_permission_error_has_401_status(): void {
		wp_set_current_user( 0 );

		$error = ( new AuthApiController() )->get_auth_token_permissions_check(
			new WP_REST_Request( 'POST', '/vip-rtc/v1/websocket/auth' )
		);
		self::assertInstanceOf( WP_Error::class, $error );
		self::assertSame( 'rest_forbidden', $error->get_error_code() );
		self::assertSame( [ 'status' => 401 ], $error->get_error_data() );

		$response = rest_convert_error_to_response( $error );
		self::assertSame( 401, $response->get_status() );
		self::assertSame( 401, $response->get_data()['data']['status'] );
	}
}
