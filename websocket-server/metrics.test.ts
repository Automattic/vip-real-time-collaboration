import assert from 'node:assert';
import { it } from 'node:test';
import { register } from 'prom-client';

import { createMetricsServer } from './metrics';

it( 'registers default Node.js metrics', () => {
	createMetricsServer();

	assert.ok( register.getSingleMetric( 'nodejs_heap_size_used_bytes' ) );
} );
