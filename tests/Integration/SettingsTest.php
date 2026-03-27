<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration;

use VIPRealTimeCollaboration\Settings\Settings;
use VIPRealTimeCollaboration\Tests\Traits\ReflectionUtils;
use Yoast\WPTestUtils\WPIntegration\TestCase;
use function add_filter;
use function remove_filter;

/**
 * Integration Tests for the Settings class.
 */
final class SettingsTest extends TestCase {
	use ReflectionUtils;

	public function set_up(): void {
		parent::set_up();

		// Ensure the option is reset before each test.
		delete_option( Settings::GUTENBERG_OPTION_NAME );

		Settings::init();
	}

	/**
	 * Verifies that is_vip_rtc_enabled() works as expected.
	 *
	 * @covers \VIPRealTimeCollaboration\Compatibility\Settings::is_vip_rtc_enabled
	 */
	public function test_is_vip_rtc_enabled(): void {
		$is_rtc_enabled = self::get_method( 'is_vip_rtc_enabled', Settings::class );

		// RTC should be enabled by default.
		self::assertTrue( $is_rtc_enabled->invoke( null ), 'RTC should be enabled by default' );

		// It should be possible to add a filter with higher priority to disable RTC.
		$filter_name = 'default_option_' . Settings::GUTENBERG_OPTION_NAME;
		add_filter( $filter_name, '__return_zero', 100 );
		self::assertFalse( $is_rtc_enabled->invoke( null ), 'RTC can be disabled via default_option filter' );
		remove_filter( $filter_name, '__return_zero', 100 );

		// Removing the filter should re-enable RTC.
		self::assertTrue( $is_rtc_enabled->invoke( null ), 'RTC can be re-enabled by removing the default_option filter' );

		// It should be possible to add a pre_option filter to disable RTC.
		$filter_name = 'pre_option_' . Settings::GUTENBERG_OPTION_NAME;
		add_filter( $filter_name, '__return_zero' );
		self::assertFalse( $is_rtc_enabled->invoke( null ), 'RTC can be disabled via pre_option filter' );
		remove_filter( $filter_name, '__return_zero' );

		// Removing the filter should re-enable RTC.
		self::assertTrue( $is_rtc_enabled->invoke( null ), 'RTC can be re-enabled by removing the pre_option filter' );
	}
}
