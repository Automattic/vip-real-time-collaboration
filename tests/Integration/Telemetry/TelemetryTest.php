<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration\Telemetry;

use PHPUnit\Framework\MockObject\MockObject;
use VIPRealTimeCollaboration\Telemetry\Telemetry;
use VIPRealTimeCollaboration\Tests\Mocks\MockTelemetry;
use WP_UnitTestCase;

use function do_action;

final class TelemetryTest extends WP_UnitTestCase {
	private string $plugin_path;
	private MockObject $mock_telemetry;

	protected function setUp(): void {
		parent::setUp();
		$this->plugin_path = '/path/to/plugin';
		$this->mock_telemetry = $this->createMock( MockTelemetry::class );
		Telemetry::reset();
	}

	/**
	 * Verifies that plugin activation gets logged by telemetry.
	 *
	 * @covers \VIPRealTimeCollaboration\Telemetry\Telemetry::track_plugin_activation
	 */
	public function test_track_plugin_activation_calls_record_event(): void {
		$this->mock_telemetry
			->expects( $this->once() )
			->method( 'record_event' )
			->with(
				'plugin_toggle',
				$this->equalTo( [ 'action' => 'activate' ] )
			);

		Telemetry::init( $this->plugin_path, $this->mock_telemetry );
		do_action( 'activated_plugin', $this->plugin_path );
	}

	/**
	 * Verifies that other plugin activations don't get logged by telemetry.
	 *
	 * @covers \VIPRealTimeCollaboration\Telemetry\Telemetry::track_plugin_activation
	 */
	public function test_track_plugin_activation_does_not_call_record_event_for_other_plugins(): void {
		$this->mock_telemetry
			->expects( $this->never() )
			->method( 'record_event' );

		Telemetry::init( $this->plugin_path, $this->mock_telemetry );
		do_action( 'activated_plugin', '/path/to/other-plugin' );
	}

	/**
	 * Verifies that plugin deactivation gets logged by telemetry.
	 *
	 * @covers \VIPRealTimeCollaboration\Telemetry\Telemetry::track_plugin_deactivation
	 */
	public function test_track_plugin_deactivation_calls_record_event(): void {
		$this->mock_telemetry
			->expects( $this->once() )
			->method( 'record_event' )
			->with(
				'plugin_toggle',
				$this->equalTo( [ 'action' => 'deactivate' ] )
			);

		Telemetry::init( $this->plugin_path, $this->mock_telemetry );
		do_action( 'deactivated_plugin', $this->plugin_path );
	}

	/**
	 * Verifies that other plugin deactivations don't get logged by telemetry.
	 *
	 * @covers \VIPRealTimeCollaboration\Telemetry\Telemetry::track_plugin_deactivation
	 */
	public function test_track_plugin_deactivation_does_not_call_record_event_for_other_plugins(): void {
		$this->mock_telemetry
			->expects( $this->never() )
			->method( 'record_event' );

		Telemetry::init( $this->plugin_path, $this->mock_telemetry );
		do_action( 'deactivated_plugin', '/path/to/other-plugin' );
	}
}
