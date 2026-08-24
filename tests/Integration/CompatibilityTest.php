<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration;

use VIPRealTimeCollaboration\Compatibility\Compatibility;
use VIPRealTimeCollaboration\Tests\Traits\ReflectionUtils;
use Yoast\WPTestUtils\WPIntegration\TestCase;
use function activate_plugin;
use function deactivate_plugins;

/**
 * Integration Tests for the Compatibility class.
 */
final class CompatibilityTest extends TestCase {
	use ReflectionUtils;

	/**
	 * Verifies that should_plugin_load() works as expected.
	 *
	 * @covers \VIPRealTimeCollaboration\Compatibility\Compatibility::should_plugin_load
	 * @uses \VIPRealTimeCollaboration\Compatibility\Compatibility::is_websocket_url_defined
	 * @uses \VIPRealTimeCollaboration\Compatibility\Compatibility::is_gutenberg_plugin_active
	 * @uses \VIPRealTimeCollaboration\Compatibility\Compatibility::is_gutenberg_plugin_version_compatible
	 * @uses \VIPRealTimeCollaboration\Compatibility\Compatibility::is_compatible_gutenberg_version
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
	 * Verifies Gutenberg version compatibility checks.
	 *
	 * @covers \VIPRealTimeCollaboration\Compatibility\Compatibility::is_compatible_gutenberg_version
	 */
	public function test_gutenberg_version_compatibility(): void {
		$is_compatible_gutenberg_version = self::get_method( 'is_compatible_gutenberg_version', Compatibility::class );

		$versions = [
			'undefined version' => [ null, false ],
			'invalid version type' => [ true, false ],
			'older release' => [ '23.7.0', false ],
			'prerelease' => [ '23.8.0-rc.1', false ],
			'minimum release' => [ '23.8.0', true ],
			'newer release' => [ '23.9.0', true ],
		];

		foreach ( $versions as $message => [ $version, $expected ] ) {
			self::assertSame( $expected, $is_compatible_gutenberg_version->invoke( null, $version ), $message );
		}
	}
}
