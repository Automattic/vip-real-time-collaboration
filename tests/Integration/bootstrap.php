<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\Tests\Integration;

// Require composer dependencies.
require_once __DIR__ . '/../../vendor/autoload.php';

// Set the tests directory.
$_wp_tests_dir = getenv( 'WP_TESTS_DIR' );
$_tests_dir = $_wp_tests_dir ? $_wp_tests_dir : getenv( 'WP_PHPUNIT__DIR' );
if ( ! $_tests_dir ) {
	$_tests_dir = rtrim( sys_get_temp_dir(), '/\\' ) . '/wordpress-tests-lib';
}

// Check that tests are installed.
if ( ! file_exists( "{$_tests_dir}/includes/functions.php" ) ) {
	// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo "Could not find {$_tests_dir}/includes/functions.php. Please run bin/install-wp-tests.sh." . PHP_EOL;
	exit( 1 );
}

// Forward custom PHPUnit Polyfills configuration to PHPUnit bootstrap file.
$_phpunit_polyfills_path = getenv( 'WP_TESTS_PHPUNIT_POLYFILLS_PATH' );
if ( false !== $_phpunit_polyfills_path ) {
	define( 'WP_TESTS_PHPUNIT_POLYFILLS_PATH', $_phpunit_polyfills_path );
}

// Give access to required functions/classes.
require_once "{$_tests_dir}/includes/functions.php";
require_once __DIR__ . '/../../vendor/yoast/wp-test-utils/src/WPIntegration/bootstrap-functions.php';

// Manually load the plugin being tested.
tests_add_filter( 'muplugins_loaded', function (): void {
	require __DIR__ . '/../../vip-realtime-collaboration.php';
} );

// Start up the WP testing environment.
require "{$_tests_dir}/includes/bootstrap.php";
