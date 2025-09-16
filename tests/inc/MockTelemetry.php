<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Mocks;

final class MockTelemetry {
	public function record_event( string $_name, array $_props ): void {}
}
