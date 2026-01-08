<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration;

use VIPRealTimeCollaboration\Compatibility\Compatibility;
use VIPRealTimeCollaboration\Tests\Traits\ReflectionUtils;
use Yoast\WPTestUtils\WPIntegration\TestCase;
use function activate_plugin;
use function deactivate_plugins;
use function delete_option;
use function update_option;

/**
 * Integration Tests for the Compatibility class.
 */
final class CompatibilityTest extends TestCase {
	use ReflectionUtils;

	public function tearDown(): void {
		delete_option( 'gutenberg-experiments' );

		parent::tearDown();
	}

	/**
	 * Verifies that should_plugin_load() works as expected.
	 *
	 * @covers \VIPRealTimeCollaboration\Compatibility\Compatibility::should_plugin_load
	 * @uses \VIPRealTimeCollaboration\Compatibility\Compatibility::is_websocket_url_defined
	 * @uses \VIPRealTimeCollaboration\Compatibility\Compatibility::is_gutenberg_plugin_active
	 */
	public function test_should_plugin_load(): void {
		$is_gutenberg_plugin_active = self::get_method( 'is_gutenberg_plugin_active', Compatibility::class );
		$should_plugin_load = self::get_method( 'should_plugin_load', Compatibility::class );

		// Gutenberg deactivated.
		deactivate_plugins( 'gutenberg/gutenberg.php' );
		self::assertFalse( $is_gutenberg_plugin_active->invoke( null ), 'is_gutenberg_plugin_active should be false' );
		self::assertFalse( $should_plugin_load->invoke( null ), 'should_plugin_load() should be false' );

		// Gutenberg activated.
		activate_plugin( 'gutenberg/gutenberg.php' );
		self::assertTrue( $is_gutenberg_plugin_active->invoke( null ), 'is_gutenberg_plugin_active should be true' );
		self::assertTrue( $should_plugin_load->invoke( null ), 'should_plugin_load() should be true' );
	}

	/**
	 * Verifies that enable_sync_collaboration_experiment() handles empty string option value.
	 *
	 * @covers \VIPRealTimeCollaboration\Compatibility\Compatibility::enable_sync_collaboration_experiment
	 */
	public function test_enable_sync_collaboration_experiment_when_option_does_not_exist(): void {
		new Compatibility();

		$result = get_option( 'gutenberg-experiments' );

		self::assertIsArray( $result, 'Filter should return an array when given an empty string' );
		self::assertArrayHasKey( 'gutenberg-sync-collaboration', $result, 'Result should contain the sync collaboration experiment' );
		self::assertTrue( $result['gutenberg-sync-collaboration'], 'Sync collaboration experiment should be enabled' );
	}

	public function option_values_provider(): array {
		return [
			'empty string' => [ '' ],
			'non-empty string' => [ 'foo' ],
			'null' => [ null ],
			'false' => [ false ],
			'empty_array' => [ [] ],
			'array_without_experiment' => [ [ 'some-other-experiment' => true ] ],
			'array_with_experiment_disabled' => [ [ 'gutenberg-sync-collaboration' => false ] ],
			'array_with_experiment_enabled' => [ [ 'gutenberg-sync-collaboration' => true ] ],
		];
	}

	/**
	 * Verifies that enable_sync_collaboration_experiment() handles various option
	 * values via a data provider.
	 *
	 * @covers \VIPRealTimeCollaboration\Compatibility\Compatibility::enable_sync_collaboration_experiment
	 * @dataProvider option_values_provider
	 * @global $pagenow
	 *
	 * @param mixed $option_value The option value to set before testing.
	 *
	 * @psalm-suppress UnusedParam Psalm does not detect usage via dataProvider.
	 */
	public function test_enable_sync_collaboration_experiment_when_option_is_set_to( mixed $option_value ): void {
		update_option( 'gutenberg-experiments', $option_value );

		new Compatibility();

		$result = get_option( 'gutenberg-experiments' );

		self::assertIsArray( $result, 'Filter should return an array when given an empty string' );
		self::assertArrayHasKey( 'gutenberg-sync-collaboration', $result, 'Result should contain the sync collaboration experiment' );
		self::assertTrue( $result['gutenberg-sync-collaboration'], 'Sync collaboration experiment should be enabled' );
	}

	/**
	 * Verifies that enable_sync_collaboration_experiment() handles various option
	 * values on the site editor page via a data provider.
	 *
	 * @covers \VIPRealTimeCollaboration\Compatibility\Compatibility::enable_sync_collaboration_experiment
	 * @dataProvider option_values_provider
	 * @global $pagenow
	 *
	 * @param mixed $option_value The option value to set before testing.
	 *
	 * @psalm-suppress UnusedParam Psalm does not detect usage via dataProvider.
	 */
	public function test_disables_sync_collaboration_experiment_on_site_editor( mixed $option_value ): void {
		global $pagenow;

		// Simulate Site Editor page.
		$previous_pagenow = $pagenow;
		$pagenow = 'site-editor.php';

		update_option( 'gutenberg-experiments', $option_value );

		new Compatibility();

		$result = get_option( 'gutenberg-experiments' );

		self::assertIsArray( $result, 'Filter should return an array when given an empty string' );
		self::assertArrayNotHasKey( 'gutenberg-sync-collaboration', $result, 'Result should not contain the sync collaboration experiment' );

		$pagenow = $previous_pagenow;
	}

	/**
	 * Verifies that enable_sync_collaboration_experiment() only diables the sync
	 * collaboration experiment on the site editor page, leaving other experiments
	 * intact.
	 *
	 * @covers \VIPRealTimeCollaboration\Compatibility\Compatibility::enable_sync_collaboration_experiment
	 * @global $pagenow
	 */
	public function test_disables_only_sync_collaboration_experiment_on_site_editor(): void {
		global $pagenow;

		// Simulate Site Editor page.
		$previous_pagenow = $pagenow;
		$pagenow = 'site-editor.php';

		update_option( 'gutenberg-experiments', [ 'foo' => true ] );

		new Compatibility();

		$result = get_option( 'gutenberg-experiments' );

		self::assertIsArray( $result, 'Filter should return an array when given an empty string' );
		self::assertArrayNotHasKey( 'gutenberg-sync-collaboration', $result, 'Result should not contain the sync collaboration experiment' );
		self::assertArrayHasKey( 'foo', $result, 'Result should contain the test experiment' );
		self::assertTrue( $result['foo'], 'Test experiment should be enabled' );

		$pagenow = $previous_pagenow;
	}

	/**
	 * Verifies that get_supported_post_types() returns post types with editor support.
	 *
	 * @covers \VIPRealTimeCollaboration\Compatibility\Compatibility::get_supported_post_types
	 */
	public function test_get_supported_post_types_returns_default_post_types(): void {
		$supported_post_types = Compatibility::get_supported_post_types();

		self::assertIsArray( $supported_post_types, 'Should return an array' );
		self::assertContains( 'post', $supported_post_types, 'Should include post type' );
		self::assertContains( 'page', $supported_post_types, 'Should include page type' );
	}

	/**
	 * Verifies that the vip_real_time_collaboration_supported_post_types filter works correctly.
	 *
	 * @covers \VIPRealTimeCollaboration\Compatibility\Compatibility::get_supported_post_types
	 */
	public function test_get_supported_post_types_filter_can_exclude_post_types(): void {
		$filter_callback = function ( array $post_types ): array {
			return array_diff( $post_types, [ 'page' ] );
		};

		add_filter( 'vip_real_time_collaboration_supported_post_types', $filter_callback );

		$supported_post_types = Compatibility::get_supported_post_types();

		self::assertIsArray( $supported_post_types, 'Should return an array' );
		self::assertContains( 'post', $supported_post_types, 'Should include post type' );
		self::assertNotContains( 'page', $supported_post_types, 'Should not include page type after filtering' );

		remove_filter( 'vip_real_time_collaboration_supported_post_types', $filter_callback );
	}

	/**
	 * Verifies that the vip_real_time_collaboration_supported_post_types filter works with custom post types.
	 *
	 * @covers \VIPRealTimeCollaboration\Compatibility\Compatibility::get_supported_post_types
	 */
	public function test_get_supported_post_types_filter_can_exclude_custom_post_types(): void {
		// Register a custom post type for testing.
		register_post_type(
			'product',
			[
				'public' => true,
				'supports' => [ 'editor' ],
			]
		);

		// Verify the custom post type is included by default.
		$supported_post_types = Compatibility::get_supported_post_types();
		self::assertContains( 'product', $supported_post_types, 'Custom post type should be included by default' );

		// Add filter to exclude the custom post type.
		$filter_callback = function ( array $post_types ): array {
			return array_diff( $post_types, [ 'product' ] );
		};

		add_filter( 'vip_real_time_collaboration_supported_post_types', $filter_callback );

		$supported_post_types = Compatibility::get_supported_post_types();

		self::assertNotContains( 'product', $supported_post_types, 'Custom post type should be excluded after filtering' );
		self::assertContains( 'post', $supported_post_types, 'Other post types should still be included' );

		remove_filter( 'vip_real_time_collaboration_supported_post_types', $filter_callback );

		// Clean up.
		unregister_post_type( 'product' );
	}
}
