<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration;

use VIPRealTimeCollaboration\Settings\Settings;
use Yoast\WPTestUtils\WPIntegration\TestCase;
use function add_filter;
use function remove_filter;

/**
 * Integration Tests for the Settings class.
 */
final class SettingsTest extends TestCase {
	public function set_up(): void {
		parent::set_up();

		// Ensure the option is reset before each test.
		delete_option( Settings::GUTENBERG_EXPERIMENTS_OPTION_NAME );
		delete_option( Settings::OPTION_NAME );

		Settings::init();
	}

	/**
	 * Verifies that the Gutenberg RTC experiment is enabled by default.
	 *
	 * @covers \VIPRealTimeCollaboration\Settings\Settings::is_gutenberg_rtc_experiment_enabled
	 */
	public function test_gutenberg_rtc_experiment_is_enabled_by_default(): void {
		self::assertTrue( Settings::is_gutenberg_rtc_experiment_enabled() );
	}

	/**
	 * Verifies that the RTC experiment can be disabled with a default_option filter.
	 *
	 * @covers \VIPRealTimeCollaboration\Settings\Settings::is_gutenberg_rtc_experiment_enabled
	 */
	public function test_gutenberg_rtc_experiment_can_be_disabled_with_default_option_filter(): void {
		$filter_name = 'default_option_' . Settings::GUTENBERG_EXPERIMENTS_OPTION_NAME;
		add_filter( $filter_name, '__return_empty_array', 100 );
		self::assertFalse( Settings::is_gutenberg_rtc_experiment_enabled() );
		remove_filter( $filter_name, '__return_empty_array', 100 );

		self::assertTrue( Settings::is_gutenberg_rtc_experiment_enabled() );
	}

	/**
	 * Verifies that the RTC experiment can be disabled with a pre_option filter.
	 *
	 * @covers \VIPRealTimeCollaboration\Settings\Settings::is_gutenberg_rtc_experiment_enabled
	 */
	public function test_gutenberg_rtc_experiment_can_be_disabled_with_pre_option_filter(): void {
		$filter_name = 'pre_option_' . Settings::GUTENBERG_EXPERIMENTS_OPTION_NAME;
		add_filter( $filter_name, '__return_empty_array' );
		self::assertFalse( Settings::is_gutenberg_rtc_experiment_enabled() );
		remove_filter( $filter_name, '__return_empty_array' );

		self::assertTrue( Settings::is_gutenberg_rtc_experiment_enabled() );
	}

	/**
	 * Verifies that a persisted empty experiment list still enables RTC.
	 *
	 * @covers \VIPRealTimeCollaboration\Settings\Settings::is_gutenberg_rtc_experiment_enabled
	 */
	public function test_gutenberg_rtc_experiment_is_enabled_with_empty_option(): void {
		add_option( Settings::GUTENBERG_EXPERIMENTS_OPTION_NAME, [] );
		self::assertTrue( Settings::is_gutenberg_rtc_experiment_enabled() );
	}

	/**
	 * Verifies that disabling the plugin setting disables the RTC experiment.
	 *
	 * @covers \VIPRealTimeCollaboration\Settings\Settings::is_gutenberg_rtc_experiment_enabled
	 * @covers \VIPRealTimeCollaboration\Settings\Settings::is_vip_rtc_enabled
	 */
	public function test_plugin_setting_disables_gutenberg_rtc_experiment(): void {
		add_option( Settings::OPTION_NAME, [ 'enable-vip-rtc' => false ] );
		add_option(
			Settings::GUTENBERG_EXPERIMENTS_OPTION_NAME,
			[
				'gutenberg-example-experiment' => true,
				Settings::GUTENBERG_RTC_EXPERIMENT_NAME => true,
			]
		);

		self::assertFalse( Settings::is_vip_rtc_enabled() );
		self::assertFalse( Settings::is_gutenberg_rtc_experiment_enabled() );
		self::assertSame(
			[
				'gutenberg-example-experiment' => true,
				Settings::GUTENBERG_RTC_EXPERIMENT_NAME => false,
			],
			get_option( Settings::GUTENBERG_EXPERIMENTS_OPTION_NAME )
		);
	}

	/**
	 * Verifies that the settings form stores explicit enabled and disabled values.
	 *
	 * @covers \VIPRealTimeCollaboration\Settings\Settings::sanitize_settings
	 */
	public function test_plugin_setting_is_sanitized(): void {
		self::assertSame( [ 'enable-vip-rtc' => true ], Settings::sanitize_settings( [ 'enable-vip-rtc' => '1' ] ) );
		self::assertSame( [ 'enable-vip-rtc' => false ], Settings::sanitize_settings( [ 'enable-vip-rtc' => '0' ] ) );
		self::assertSame( [ 'enable-vip-rtc' => true ], Settings::sanitize_settings( 'invalid' ) );
		self::assertSame( [ 'enable-vip-rtc' => true ], Settings::sanitize_settings( [] ) );
	}

	/**
	 * Verifies that malformed saved settings do not disable RTC.
	 *
	 * @covers \VIPRealTimeCollaboration\Settings\Settings::is_vip_rtc_enabled
	 */
	public function test_malformed_plugin_setting_defaults_to_enabled(): void {
		update_option( Settings::OPTION_NAME, 'invalid' );
		self::assertTrue( Settings::is_vip_rtc_enabled() );

		update_option( Settings::OPTION_NAME, [] );
		self::assertTrue( Settings::is_vip_rtc_enabled() );
	}

	/**
	 * Verifies that RTC is hidden from Gutenberg's experiments schema.
	 *
	 * @covers \VIPRealTimeCollaboration\Settings\Settings::hide_gutenberg_rtc_experiment
	 */
	public function test_gutenberg_rtc_experiment_is_hidden_from_schema(): void {
		$args = [
			'show_in_rest' => [
				'schema' => [
					'properties' => [
						'gutenberg-example-experiment' => [ 'type' => 'boolean' ],
						Settings::GUTENBERG_RTC_EXPERIMENT_NAME => [ 'type' => 'boolean' ],
					],
				],
			],
		];

		self::assertSame(
			[
				'show_in_rest' => [
					'schema' => [
						'properties' => [
							'gutenberg-example-experiment' => [ 'type' => 'boolean' ],
						],
					],
				],
			],
			Settings::hide_gutenberg_rtc_experiment(
				$args,
				[],
				Settings::GUTENBERG_EXPERIMENTS_OPTION_NAME,
				Settings::GUTENBERG_EXPERIMENTS_OPTION_NAME
			)
		);
	}

	/**
	 * Verifies that unrelated settings schemas are unchanged.
	 *
	 * @covers \VIPRealTimeCollaboration\Settings\Settings::hide_gutenberg_rtc_experiment
	 */
	public function test_unrelated_settings_schema_is_unchanged(): void {
		$args = [ 'show_in_rest' => true ];

		self::assertSame( $args, Settings::hide_gutenberg_rtc_experiment( $args, [], 'another-group', 'another-option' ) );
	}

	/**
	 * Verifies that enabling RTC preserves other Gutenberg experiments.
	 *
	 * @covers \VIPRealTimeCollaboration\Settings\Settings::is_gutenberg_rtc_experiment_enabled
	 */
	public function test_enabling_rtc_preserves_other_experiments(): void {
		$experiments = [ 'gutenberg-example-experiment' => true ];

		add_option( Settings::GUTENBERG_EXPERIMENTS_OPTION_NAME, $experiments );

		self::assertTrue( Settings::is_gutenberg_rtc_experiment_enabled() );
		self::assertSame(
			[
				'gutenberg-example-experiment' => true,
				Settings::GUTENBERG_RTC_EXPERIMENT_NAME => true,
			],
			get_option( Settings::GUTENBERG_EXPERIMENTS_OPTION_NAME )
		);
	}
}
