<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\Tests\Integration;

use VIPRealtimeCollaboration\Compatibility\Compatibility;
use VIPRealtimeCollaboration\Tests\Traits\ReflectionUtils;
use Yoast\WPTestUtils\WPIntegration\TestCase;

/**
 * Integration Tests for the Compatibility class.
 */
final class CompatibilityTest extends TestCase {
	use ReflectionUtils;

	/**
	 * Verifies that should_plugin_load() works as expected.
	 *
	 * @covers \VIPRealtimeCollaboration\Compatibility\Compatibility::should_plugin_load
	 * @uses \VIPRealtimeCollaboration\Compatibility\Compatibility::is_websocket_url_defined
	 * @uses \VIPRealtimeCollaboration\Compatibility\Compatibility::is_gutenberg_plugin_active
	 */
	public function test_should_plugin_load(): void {
		$is_websocket_url_defined = self::get_method( 'is_websocket_url_defined', Compatibility::class );
		$is_gutenberg_plugin_active = self::get_method( 'is_gutenberg_plugin_active', Compatibility::class );
		$should_plugin_load = self::get_method( 'should_plugin_load', Compatibility::class );

		// Start with Gutenberg and WebSocket server deactivated.
		deactivate_plugins( 'gutenberg/gutenberg.php' );

		self::assertFalse( $is_websocket_url_defined->invoke( null ), 'is_websocket_url_defined() should be false' );
		self::assertFalse( $is_gutenberg_plugin_active->invoke( null ), 'is_gutenberg_plugin_active should be false' );
		self::assertFalse( $should_plugin_load->invoke( null ), 'should_plugin_load() should be false' );

		// "Activate" the WebSocket server.
		define( 'VIP_RTC_WS_URL', 'test' );
		self::assertTrue( $is_websocket_url_defined->invoke( null ), 'is_websocket_url_defined() should be true' );
		self::assertFalse( $is_gutenberg_plugin_active->invoke( null ), 'is_gutenberg_plugin_active should be false' );
		self::assertFalse( $should_plugin_load->invoke( null ), 'should_plugin_load() should be false' );

		// Activate Gutenberg.
		activate_plugin( 'gutenberg/gutenberg.php' );
		self::assertTrue( $is_gutenberg_plugin_active->invoke( null ), 'is_gutenberg_plugin_active should be true' );
		self::assertTrue( $is_websocket_url_defined->invoke( null ), 'is_websocket_url_defined() should be true' );
		self::assertTrue( $should_plugin_load->invoke( null ), 'should_plugin_load() should be true' );
	}
}
