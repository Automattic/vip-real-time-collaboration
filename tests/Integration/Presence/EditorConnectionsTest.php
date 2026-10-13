<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration\Presence;

use VIPRealTimeCollaboration\Presence\EditorConnections;
use Yoast\WPTestUtils\WPIntegration\TestCase;

/**
 * Integration tests for the EditorConnections class.
 */
final class EditorConnectionsTest extends TestCase {
	private int $post_id;

	public function set_up(): void {
		parent::set_up();

		$editor = self::factory()->user->create( [ 'role' => 'editor' ] );
		wp_set_current_user( $editor );

		$this->post_id = self::factory()->post->create();
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\EditorConnections::record
	 * @covers \VIPRealTimeCollaboration\Presence\EditorConnections::get_count
	 */
	public function test_records_the_count_an_editor_reports(): void {
		EditorConnections::record( [], [ EditorConnections::HEARTBEAT_KEY => [ $this->post_id => 2 ] ] );

		self::assertSame( 2, EditorConnections::get_count( $this->post_id ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\EditorConnections::get_count
	 */
	public function test_a_post_nobody_reported_has_no_connections(): void {
		self::assertSame( 0, EditorConnections::get_count( $this->post_id ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\EditorConnections::record
	 */
	public function test_ignores_posts_the_user_cannot_edit(): void {
		wp_set_current_user( self::factory()->user->create( [ 'role' => 'subscriber' ] ) );

		EditorConnections::record( [], [ EditorConnections::HEARTBEAT_KEY => [ $this->post_id => 2 ] ] );

		self::assertSame( 0, EditorConnections::get_count( $this->post_id ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\EditorConnections::record
	 */
	public function test_ignores_counts_out_of_range(): void {
		EditorConnections::record( [], [ EditorConnections::HEARTBEAT_KEY => [ $this->post_id => 0 ] ] );
		EditorConnections::record( [], [ EditorConnections::HEARTBEAT_KEY => [ $this->post_id => 5000 ] ] );

		self::assertSame( 0, EditorConnections::get_count( $this->post_id ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\EditorConnections::record
	 */
	public function test_leaves_the_heartbeat_response_unchanged(): void {
		$response = [ 'other' => 'value' ];

		self::assertSame(
			$response,
			EditorConnections::record( $response, [ EditorConnections::HEARTBEAT_KEY => [ $this->post_id => 1 ] ] )
		);
	}
}
