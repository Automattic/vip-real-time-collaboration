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
}
