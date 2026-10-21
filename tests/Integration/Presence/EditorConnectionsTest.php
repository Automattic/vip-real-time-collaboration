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
	 * @covers \VIPRealTimeCollaboration\Presence\EditorConnections::record
	 */
	public function test_a_higher_count_replaces_a_lower_one_at_once(): void {
		$this->report( 1 );
		$this->report( 2 );

		self::assertSame( 2, EditorConnections::get_count( $this->post_id ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\EditorConnections::record
	 */
	public function test_a_delayed_lower_report_does_not_replace_a_recent_higher_count(): void {
		$this->report( 2 );
		$this->report( 1 );

		self::assertSame( 2, EditorConnections::get_count( $this->post_id ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\EditorConnections::record
	 */
	public function test_a_lower_report_replaces_a_higher_count_nobody_has_confirmed_lately(): void {
		$this->store( 2, time() - EditorConnections::HOLD_HIGHER );
		$this->report( 1 );

		self::assertSame( 1, EditorConnections::get_count( $this->post_id ) );
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

	private function report( int $connections ): void {
		EditorConnections::record( [], [ EditorConnections::HEARTBEAT_KEY => [ $this->post_id => $connections ] ] );
	}

	/**
	 * Store a report as if it arrived at `$reported_at`, using the class's
	 * transient key.
	 */
	private function store( int $connections, int $reported_at ): void {
		set_transient(
			'vip_rtc_editor_connections_' . $this->post_id,
			[
				'count' => $connections,
				'reported_at' => $reported_at,
			],
			EditorConnections::TTL
		);
	}
}
