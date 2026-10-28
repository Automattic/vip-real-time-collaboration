<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration;

use VIPRealTimeCollaboration\Settings\Settings;
use Yoast\WPTestUtils\WPIntegration\TestCase;

// phpcs:disable WordPressVIPMinimum.Functions.RestrictedFunctions -- These isolated tests create and remove real filesystem fixtures, never production files.

/**
 * Use real loaded functions without leaking gutenberg_pre_init between tests.
 *
 * @covers \VIPRealTimeCollaboration\Settings\Settings::get_gutenberg_path
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
final class GutenbergPathTest extends TestCase {
	private ?string $fixture_directory = null;
	private ?string $symlink = null;

	public function tear_down(): void {
		if ( null !== $this->symlink ) {
			unlink( $this->symlink );
		}

		if ( null !== $this->fixture_directory ) {
			unlink( $this->fixture_directory . '/gutenberg.php' );
			rmdir( $this->fixture_directory );
		}

		parent::tear_down();
	}

	private function create_gutenberg_fixture( string $directory ): string {
		self::assertTrue( mkdir( $directory ) );
		$this->fixture_directory = $directory;
		$file_name = $directory . '/gutenberg.php';
		self::assertNotFalse( file_put_contents( $file_name, '<?php function gutenberg_pre_init(): void {}' ) );

		return $file_name;
	}

	public function test_gutenberg_not_loaded_returns_unknown(): void {
		self::assertFalse( function_exists( 'gutenberg_pre_init' ) );
		self::assertSame( 'Unknown', Settings::get_gutenberg_path() );
	}

	public function test_path_under_wordpress_root_is_relative(): void {
		$directory_name = 'gutenberg-path-test-' . wp_generate_uuid4();
		$file_name = $this->create_gutenberg_fixture( ABSPATH . $directory_name );
		/** @psalm-suppress UnresolvableInclude The fixture defines the loaded Gutenberg entrypoint. */
		require $file_name;

		self::assertSame( $directory_name . '/gutenberg.php', Settings::get_gutenberg_path() );
	}

	public function test_path_outside_wordpress_root_stays_absolute(): void {
		$file_name = $this->create_gutenberg_fixture( get_temp_dir() . 'gutenberg-path-test-' . wp_generate_uuid4() );
		/** @psalm-suppress UnresolvableInclude The fixture defines the loaded Gutenberg entrypoint. */
		require $file_name;

		self::assertSame( wp_normalize_path( (string) realpath( $file_name ) ), Settings::get_gutenberg_path() );
	}

	public function test_similarly_prefixed_sibling_path_is_not_truncated(): void {
		$directory = untrailingslashit( ABSPATH ) . '-gutenberg-path-test-' . wp_generate_uuid4();
		$file_name = $this->create_gutenberg_fixture( $directory );
		/** @psalm-suppress UnresolvableInclude The fixture defines the loaded Gutenberg entrypoint. */
		require $file_name;

		self::assertSame( wp_normalize_path( (string) realpath( $file_name ) ), Settings::get_gutenberg_path() );
	}

	public function test_symlink_inside_wordpress_root_preserves_external_target(): void {
		$file_name = $this->create_gutenberg_fixture( get_temp_dir() . 'gutenberg-path-test-' . wp_generate_uuid4() );
		$symlink = ABSPATH . 'gutenberg-path-test-' . wp_generate_uuid4() . '.php';
		self::assertTrue( symlink( $file_name, $symlink ) );
		$this->symlink = $symlink;
		/** @psalm-suppress UnresolvableInclude Load through the symlink, not directly from the external target. */
		require $symlink;

		self::assertSame( wp_normalize_path( (string) realpath( $file_name ) ), Settings::get_gutenberg_path() );
	}
}
