import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { afterEach, it, mock } from 'node:test';

import { logServerError } from './error-logging';
import { createMetricsServer } from './metrics';
import { createRtcServer } from './server';

import type { EventEmitter } from 'node:events';

interface LogRecord {
	level: string;
	event: string;
	error: { message: string; stack: string };
}

function captureLogs(): string[] {
	const lines: string[] = [];
	mock.method( fs, 'writeSync', ( fd: number, line: string ) => {
		assert.equal( fd, 2 );
		lines.push( line );
		return Buffer.byteLength( line );
	} );
	return lines;
}

function crashProcess( code: string ): LogRecord[] {
	// Reuse the test runner's loader, including when npm runs tsx from its cache.
	const loaderArgs = process.execArgv.flatMap( ( arg, index ) =>
		arg === '--require' || arg === '--import' ? process.execArgv.slice( index, index + 2 ) : []
	);
	const child = spawnSync( process.execPath, [ ...loaderArgs, '--eval', code ], {
		cwd: __dirname,
		encoding: 'utf8',
		timeout: 10_000,
		env: { ...process.env, NODE_OPTIONS: '' },
	} );
	assert.ifError( child.error );
	assert.equal( child.status, 1, child.stderr );
	assert.equal( child.signal, null );
	return child.stderr
		.split( '\n' )
		.filter( line => line.startsWith( '{"timestamp":' ) )
		.map( line => JSON.parse( line ) as LogRecord );
}

afterEach( () => mock.restoreAll() );

for ( const [ origin, code ] of [
	[ 'uncaughtException', "setImmediate(() => { throw new Error('fatal test failure'); });" ],
	[ 'unhandledRejection', "Promise.reject(new Error('fatal test failure'));" ],
] ) {
	it( `logs ${ origin } before the process exits with failure`, () => {
		const records = crashProcess( `
			// These crash tests do not need a listening socket; the bind test below does.
			require('node:http').Server.prototype.listen = function () { return this; };
			process.env.VIP_RTC_WS_AUTH_SECRET = 'test-secret';
			delete process.env.METRICS_PORT;
			require('./index.ts');
			${ code }
		` );
		assert.equal( records.length, 1 );
		assert.equal( records[ 0 ]?.level, 'fatal' );
		assert.equal( records[ 0 ]?.event, origin );
		assert.equal( records[ 0 ]?.error.message, 'fatal test failure' );
		assert.match( records[ 0 ]?.error.stack ?? '', /Error: fatal test failure/ );
	} );
}

it( 'logs a real startup bind failure through the entry point and still exits', () => {
	const records = crashProcess( `
		const http = require('node:http');
		const occupied = http.createServer();
		occupied.listen(0, '127.0.0.1', () => {
			process.env.HOST = '127.0.0.1';
			process.env.PORT = String(occupied.address().port);
			process.env.VIP_RTC_WS_AUTH_SECRET = 'test-secret';
			delete process.env.METRICS_PORT;
			require('./index.ts');
		});
	` );
	assert.deepEqual(
		records.map( record => [ record.level, record.event ] ),
		[
			[ 'error', 'http_server_error' ],
			[ 'fatal', 'uncaughtException' ],
		]
	);
	assert.match( records[ 0 ]?.error.message ?? '', /EADDRINUSE/ );
} );

it( 'logs errors from each server without consuming the error event', () => {
	const lines = captureLogs();
	const { server, wss } = createRtcServer( { jwtSecret: 'test-secret', connectionTimeout: 1_000 } );
	const metricsServer = createMetricsServer();
	const error = new Error( 'server test failure' );
	try {
		for ( const emitter of [ server, wss, metricsServer ] as EventEmitter[] ) {
			assert.throws(
				() => emitter.emit( 'error', error ),
				thrown => thrown === error
			);
		}
		assert.deepEqual(
			lines.map( line => ( JSON.parse( line ) as LogRecord ).event ),
			[ 'http_server_error', 'websocket_server_error', 'metrics_server_error' ]
		);
	} finally {
		wss.close();
		server.close();
		metricsServer.close();
	}
} );

it( 'redacts credentials and excludes attached request data from structured logs', () => {
	const lines = captureLogs();
	const previousSecret = process.env.VIP_RTC_WS_AUTH_SECRET;
	process.env.VIP_RTC_WS_AUTH_SECRET = 'private-test-secret';
	try {
		const error = Object.assign(
			new Error(
				'private-test-secret /_ws/room?auth=opaque-token Bearer bearer-token eyJhbGciOiJIUzI1NiJ9.payload.signature'
			),
			{ request: { headers: { authorization: 'private-request-data' } } }
		);
		logServerError( 'error', 'http_server_error', error );
		assert.equal( lines.length, 1 );
		assert.doesNotMatch(
			lines.join( '' ),
			/private-test-secret|opaque-token|bearer-token|eyJhbGci|private-request-data/
		);
		assert.match( lines.join( '' ), /\[REDACTED\]/ );
	} finally {
		if ( previousSecret === undefined ) {
			delete process.env.VIP_RTC_WS_AUTH_SECRET;
		} else {
			process.env.VIP_RTC_WS_AUTH_SECRET = previousSecret;
		}
	}
} );

it( 'does not replace the original failure when stderr is unavailable', () => {
	mock.method( fs, 'writeSync', () => {
		throw new Error( 'stderr unavailable' );
	} );
	assert.doesNotThrow( () =>
		logServerError( 'fatal', 'uncaughtException', new Error( 'original' ) )
	);
} );
