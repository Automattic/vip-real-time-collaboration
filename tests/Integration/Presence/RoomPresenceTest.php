<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration\Presence;

use VIPRealTimeCollaboration\Presence\RoomPresence;
use Yoast\WPTestUtils\WPIntegration\TestCase;

/**
 * Integration tests for the RoomPresence class.
 */
final class RoomPresenceTest extends TestCase {
	private int $post_id;
	private int $editor_id;

	public function set_up(): void {
		parent::set_up();

		$this->editor_id = self::factory()->user->create( [ 'role' => 'editor' ] );
		wp_set_current_user( $this->editor_id );

		$this->post_id = self::factory()->post->create();
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::record
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::get_user_ids
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::count_users
	 */
	public function test_a_report_counts_the_reporting_user(): void {
		$this->report();

		self::assertSame( [ $this->editor_id ], RoomPresence::get_user_ids( $this->post_id ) );
		self::assertSame( 1, RoomPresence::count_users( $this->post_id ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::record
	 */
	public function test_a_user_holds_one_row_of_their_id_and_the_time(): void {
		$this->report();
		$this->report();

		$rows = $this->rows();
		self::assertCount( 1, $rows );
		self::assertMatchesRegularExpression( '/^' . $this->editor_id . ':\d+$/', $rows[0] );
		self::assertEqualsWithDelta( time(), (int) explode( ':', $rows[0] )[1], 2 );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::record
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::get_user_ids
	 */
	public function test_each_reporting_user_holds_their_own_row(): void {
		$other = self::factory()->user->create( [ 'role' => 'editor' ] );
		$this->report();
		wp_set_current_user( $other );
		$this->report();
		$this->report();

		self::assertCount( 2, $this->rows() );
		self::assertSame( [ $this->editor_id, $other ], RoomPresence::get_user_ids( $this->post_id ) );
		self::assertSame( 2, RoomPresence::count_users( $this->post_id ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::record
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::get_user_ids
	 */
	public function test_a_user_with_two_rows_is_counted_once_and_left_with_one(): void {
		$this->stamp( time() - 5 );
		$this->stamp( time() - 3 );

		self::assertSame( [ $this->editor_id ], RoomPresence::get_user_ids( $this->post_id ) );

		$this->report();

		self::assertCount( 1, $this->rows() );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::record
	 */
	public function test_a_report_stamps_every_post_it_lists(): void {
		$second = self::factory()->post->create();

		RoomPresence::record( [], [ RoomPresence::HEARTBEAT_KEY => [ $this->post_id, (string) $second ] ] );

		self::assertSame( 1, RoomPresence::count_users( $this->post_id ) );
		self::assertSame( 1, RoomPresence::count_users( $second ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::get_user_ids
	 */
	public function test_a_row_nobody_refreshed_lapses_and_is_deleted_on_read(): void {
		$this->stamp( time() - RoomPresence::TTL );

		self::assertSame( 0, RoomPresence::count_users( $this->post_id ) );
		self::assertSame( [], $this->rows() );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::get_user_ids
	 */
	public function test_a_row_still_fresh_is_kept(): void {
		$this->stamp( time() - RoomPresence::TTL + 5 );

		self::assertSame( [ $this->editor_id ], RoomPresence::get_user_ids( $this->post_id ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::get_user_ids
	 */
	public function test_a_row_that_does_not_parse_is_deleted_on_read(): void {
		add_post_meta( $this->post_id, RoomPresence::META_KEY, 'garbage' );
		add_post_meta( $this->post_id, RoomPresence::META_KEY, 'abc:' . time() );
		add_post_meta( $this->post_id, RoomPresence::META_KEY, $this->editor_id . ':soon' );

		self::assertSame( 0, RoomPresence::count_users( $this->post_id ) );
		self::assertSame( [], $this->rows() );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::get_user_ids
	 */
	public function test_other_meta_on_the_post_is_left_alone(): void {
		add_post_meta( $this->post_id, '_thumbnail_id', '7' );
		$this->report();

		self::assertSame( [ $this->editor_id ], RoomPresence::get_user_ids( $this->post_id ) );
		self::assertSame( '7', get_post_meta( $this->post_id, '_thumbnail_id', true ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::record
	 */
	public function test_ignores_posts_the_user_cannot_edit(): void {
		wp_set_current_user( self::factory()->user->create( [ 'role' => 'subscriber' ] ) );

		$this->report();

		self::assertSame( 0, RoomPresence::count_users( $this->post_id ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::record
	 */
	public function test_ignores_a_report_that_is_not_well_formed(): void {
		RoomPresence::record( [], [ RoomPresence::HEARTBEAT_KEY => [ 'abc', '-1', 0, 1.5, [ $this->post_id ], null ] ] );
		RoomPresence::record( [], [ RoomPresence::HEARTBEAT_KEY => (string) $this->post_id ] );
		RoomPresence::record( [], [] );

		self::assertSame( 0, RoomPresence::count_users( $this->post_id ) );
		self::assertSame( [], $this->rows() );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::record
	 */
	public function test_leaves_the_response_alone(): void {
		$response = $this->report( [ 'other' => 'value' ] );

		self::assertSame( [ 'other' => 'value' ], $response );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::get_user_ids
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::count_users
	 */
	public function test_a_post_nobody_reported_has_no_presence(): void {
		self::assertSame( [], RoomPresence::get_user_ids( $this->post_id ) );
		self::assertSame( 0, RoomPresence::count_users( $this->post_id ) );
		self::assertSame( 0, RoomPresence::count_users( 0 ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::init
	 */
	public function test_hooks_the_heartbeat_and_the_export(): void {
		RoomPresence::init();

		self::assertSame( 10, has_filter( 'heartbeat_received', [ RoomPresence::class, 'record' ] ) );
		self::assertSame( 10, has_filter( 'wxr_export_skip_postmeta', [ RoomPresence::class, 'skip_export' ] ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Presence\RoomPresence::skip_export
	 */
	public function test_the_rows_are_kept_out_of_exports(): void {
		self::assertTrue( RoomPresence::skip_export( false, RoomPresence::META_KEY ) );
		self::assertFalse( RoomPresence::skip_export( false, '_thumbnail_id' ) );
		self::assertTrue( RoomPresence::skip_export( true, '_thumbnail_id' ) );
	}

	/**
	 * Run the heartbeat filter as the editor's report of this post would reach it.
	 *
	 * @param array<string, mixed> $response Response so far.
	 * @return array<string, mixed>
	 */
	private function report( array $response = [] ): array {
		return RoomPresence::record( $response, [ RoomPresence::HEARTBEAT_KEY => [ $this->post_id ] ] );
	}

	/**
	 * Store a row as if the current user reported at `$at`.
	 */
	private function stamp( int $at ): void {
		add_post_meta( $this->post_id, RoomPresence::META_KEY, get_current_user_id() . ':' . $at );
	}

	/**
	 * Every presence row on the post.
	 *
	 * @return list<mixed>
	 */
	private function rows(): array {
		return array_values( (array) get_post_meta( $this->post_id, RoomPresence::META_KEY, false ) );
	}
}
