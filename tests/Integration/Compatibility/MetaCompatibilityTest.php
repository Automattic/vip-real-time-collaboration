<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Tests\Integration\Compatibility;

use VIPRealTimeCollaboration\Compatibility\MetaCompatibility;
use Yoast\WPTestUtils\WPIntegration\TestCase;

/**
 * Integration Tests for the MetaCompatibility class.
 */
final class MetaCompatibilityTest extends TestCase {

	public function setUp(): void {
		parent::setUp();
		MetaCompatibility::reset();

		// Clear any registered meta from previous tests.
		global $wp_meta_keys;
		unset( $wp_meta_keys['post'] );
	}

	public function tearDown(): void {
		MetaCompatibility::reset();

		// Clear any filters we added.
		remove_all_filters( 'vip_rtc_meta_whitelist' );
		remove_all_filters( 'vip_rtc_enable_meta_key' );
		remove_all_filters( 'vip_rtc_enable_existing_meta_key' );

		// Clear registered meta.
		global $wp_meta_keys;
		unset( $wp_meta_keys['post'] );

		parent::tearDown();
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::get_meta_whitelist
	 */
	public function test_get_meta_whitelist_returns_default_yoast_keys(): void {
		$whitelist = MetaCompatibility::get_meta_whitelist();

		self::assertIsArray( $whitelist );
		self::assertContains( '_yoast_wpseo_title', $whitelist );
		self::assertContains( '_yoast_wpseo_metadesc', $whitelist );
		self::assertContains( '_yoast_wpseo_focuskw', $whitelist );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::get_meta_whitelist
	 */
	public function test_whitelist_can_be_filtered(): void {
		add_filter( 'vip_rtc_meta_whitelist', function ( array $keys ): array {
			$keys[] = '_custom_meta_key';
			return $keys;
		} );

		$whitelist = MetaCompatibility::get_meta_whitelist();

		self::assertContains( '_custom_meta_key', $whitelist );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::is_meta_whitelisted
	 */
	public function test_is_meta_whitelisted_returns_true_for_whitelisted_keys(): void {
		// Test with default Yoast key
		self::assertTrue( MetaCompatibility::is_meta_whitelisted( '_yoast_wpseo_title' ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::is_meta_whitelisted
	 */
	public function test_is_meta_whitelisted_returns_false_for_non_whitelisted_keys(): void {
		self::assertFalse( MetaCompatibility::is_meta_whitelisted( '_some_random_meta' ) );
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::maybe_enable_show_in_rest
	 */
	public function test_enables_show_in_rest_for_whitelisted_keys(): void {
		add_filter( 'vip_rtc_meta_whitelist', function ( array $keys ): array {
			$keys[] = '_test_meta_key';
			return $keys;
		} );

		new MetaCompatibility();

		register_post_meta( 'post', '_test_meta_key', [
			'single' => true,
			'type' => 'string',
		] );

		global $wp_meta_keys;

		self::assertTrue(
			$wp_meta_keys['post']['post']['_test_meta_key']['show_in_rest'],
			'Whitelisted meta should have show_in_rest enabled'
		);
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::maybe_enable_show_in_rest
	 */
	public function test_does_not_enable_for_non_whitelisted_keys(): void {
		new MetaCompatibility();

		register_post_meta( 'post', '_some_other_meta', [
			'single' => true,
			'type' => 'string',
		] );

		global $wp_meta_keys;

		self::assertEmpty(
			$wp_meta_keys['post']['post']['_some_other_meta']['show_in_rest'] ?? null,
			'Non-whitelisted meta should not have show_in_rest enabled'
		);
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::maybe_enable_show_in_rest
	 */
	public function test_does_not_override_existing_show_in_rest(): void {
		add_filter( 'vip_rtc_meta_whitelist', function ( array $keys ): array {
			$keys[] = '_test_meta_key';
			return $keys;
		} );

		new MetaCompatibility();

		register_post_meta( 'post', '_test_meta_key', [
			'single' => true,
			'type' => 'string',
			'show_in_rest' => [
				'schema' => [
					'type' => 'string',
					'context' => [ 'view', 'edit' ],
				],
			],
		] );

		global $wp_meta_keys;

		// Should preserve the original complex show_in_rest config.
		self::assertIsArray(
			$wp_meta_keys['post']['post']['_test_meta_key']['show_in_rest'],
			'Should preserve existing show_in_rest configuration'
		);
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::maybe_enable_show_in_rest
	 */
	public function test_sets_secure_auth_callback(): void {
		add_filter( 'vip_rtc_meta_whitelist', function ( array $keys ): array {
			$keys[] = '_test_meta_key';
			return $keys;
		} );

		new MetaCompatibility();

		register_post_meta( 'post', '_test_meta_key', [
			'single' => true,
			'type' => 'string',
		] );

		global $wp_meta_keys;

		self::assertIsCallable(
			$wp_meta_keys['post']['post']['_test_meta_key']['auth_callback'],
			'Should set an auth_callback'
		);
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::maybe_enable_show_in_rest
	 */
	public function test_sets_sanitize_callback(): void {
		add_filter( 'vip_rtc_meta_whitelist', function ( array $keys ): array {
			$keys[] = '_test_meta_key';
			return $keys;
		} );

		new MetaCompatibility();

		register_post_meta( 'post', '_test_meta_key', [
			'single' => true,
			'type' => 'string',
		] );

		global $wp_meta_keys;

		self::assertIsCallable(
			$wp_meta_keys['post']['post']['_test_meta_key']['sanitize_callback'],
			'Should set a sanitize_callback'
		);
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::maybe_enable_show_in_rest
	 */
	public function test_does_not_override_existing_auth_callback(): void {
		add_filter( 'vip_rtc_meta_whitelist', function ( array $keys ): array {
			$keys[] = '_test_meta_key';
			return $keys;
		} );

		$custom_callback = function (): bool {
			return false;
		};

		new MetaCompatibility();

		register_post_meta( 'post', '_test_meta_key', [
			'single' => true,
			'type' => 'string',
			'auth_callback' => $custom_callback,
		] );

		global $wp_meta_keys;

		self::assertSame(
			$custom_callback,
			$wp_meta_keys['post']['post']['_test_meta_key']['auth_callback'],
			'Should preserve existing auth_callback'
		);
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::maybe_enable_show_in_rest
	 */
	public function test_sets_default_type_if_not_provided(): void {
		add_filter( 'vip_rtc_meta_whitelist', function ( array $keys ): array {
			$keys[] = '_test_meta_key';
			return $keys;
		} );

		new MetaCompatibility();

		register_post_meta( 'post', '_test_meta_key', [
			'single' => true,
		] );

		global $wp_meta_keys;

		self::assertSame(
			'string',
			$wp_meta_keys['post']['post']['_test_meta_key']['type'],
			'Should set default type to string'
		);
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::maybe_enable_show_in_rest
	 */
	public function test_enable_meta_key_filter_can_disable(): void {
		add_filter( 'vip_rtc_meta_whitelist', function ( array $keys ): array {
			$keys[] = '_test_meta_key';
			return $keys;
		} );

		add_filter( 'vip_rtc_enable_meta_key', function ( bool $enable, string $meta_key ): bool {
			if ( '_test_meta_key' === $meta_key ) {
				return false;
			}
			return $enable;
		}, 10, 2 );

		new MetaCompatibility();

		register_post_meta( 'post', '_test_meta_key', [
			'single' => true,
			'type' => 'string',
		] );

		global $wp_meta_keys;

		self::assertFalse(
			$wp_meta_keys['post']['post']['_test_meta_key']['show_in_rest'] ?? false,
			'Filter should be able to disable show_in_rest'
		);
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::maybe_enable_show_in_rest
	 */
	public function test_only_processes_post_object_type(): void {
		add_filter( 'vip_rtc_meta_whitelist', function ( array $keys ): array {
			$keys[] = '_test_meta_key';
			return $keys;
		} );

		new MetaCompatibility();

		// Add a whitelisted key to the user object type (should not be modified).
		register_meta( 'user', '_test_meta_key', [
			'single' => true,
			'type' => 'string',
		] );

		global $wp_meta_keys;

		self::assertEmpty(
			$wp_meta_keys['user']['']['_test_meta_key']['show_in_rest'] ?? null,
			'Should not modify meta for non-post object types'
		);
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::update_existing_meta_registration
	 */
	public function test_updates_existing_meta_registration(): void {
		add_filter( 'vip_rtc_meta_whitelist', function ( array $keys ): array {
			$keys[] = '_test_meta_key';
			return $keys;
		} );

		global $wp_meta_keys;

		// Simulate meta already registered before our plugin.
		$wp_meta_keys['post']['']['_test_meta_key'] = [
			'single' => true,
			'type' => 'string',
			'show_in_rest' => false,
		];

		$compat = new MetaCompatibility();
		$compat->update_existing_meta_registration();

		self::assertTrue(
			$wp_meta_keys['post']['']['_test_meta_key']['show_in_rest'],
			'Existing whitelisted meta should be updated'
		);
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::update_existing_meta_registration
	 */
	public function test_update_existing_does_not_modify_non_whitelisted(): void {
		global $wp_meta_keys;

		// Simulate meta already registered before our plugin.
		$wp_meta_keys['post']['']['_some_random_meta'] = [
			'single' => true,
			'type' => 'string',
			'show_in_rest' => false,
		];

		$compat = new MetaCompatibility();
		$compat->update_existing_meta_registration();

		self::assertFalse(
			$wp_meta_keys['post']['']['_some_random_meta']['show_in_rest'],
			'Non-whitelisted meta should not be modified'
		);
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::update_existing_meta_registration
	 */
	public function test_update_existing_respects_filter(): void {
		add_filter( 'vip_rtc_meta_whitelist', function ( array $keys ): array {
			$keys[] = '_test_meta_key';
			return $keys;
		} );

		global $wp_meta_keys;

		add_filter( 'vip_rtc_enable_existing_meta_key', function ( bool $enable, string $meta_key ): bool {
			if ( '_test_meta_key' === $meta_key ) {
				return false;
			}
			return $enable;
		}, 10, 2 );

		// Simulate meta already registered before our plugin.
		$wp_meta_keys['post']['']['_test_meta_key'] = [
			'single' => true,
			'type' => 'string',
			'show_in_rest' => false,
		];

		$compat = new MetaCompatibility();
		$compat->update_existing_meta_registration();

		self::assertFalse(
			$wp_meta_keys['post']['']['_test_meta_key']['show_in_rest'],
			'Filter should prevent updating existing meta'
		);
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::update_existing_meta_registration
	 */
	public function test_update_existing_skips_already_enabled(): void {
		add_filter( 'vip_rtc_meta_whitelist', function ( array $keys ): array {
			$keys[] = '_test_meta_key';
			return $keys;
		} );

		global $wp_meta_keys;

		// Simulate meta already registered with custom show_in_rest config.
		$wp_meta_keys['post']['']['_test_meta_key'] = [
			'single' => true,
			'type' => 'string',
			'show_in_rest' => [
				'schema' => [ 'type' => 'string' ],
			],
		];

		$compat = new MetaCompatibility();
		$compat->update_existing_meta_registration();

		self::assertIsArray(
			$wp_meta_keys['post']['']['_test_meta_key']['show_in_rest'],
			'Should preserve existing show_in_rest configuration'
		);
	}

	/**
	 * @covers \VIPRealTimeCollaboration\Compatibility\MetaCompatibility::reset
	 */
	public function test_reset_clears_cached_whitelist(): void {
		// First call caches the whitelist.
		$whitelist1 = MetaCompatibility::get_meta_whitelist();

		// Add a filter that would modify the whitelist.
		add_filter( 'vip_rtc_meta_whitelist', function ( array $keys ): array {
			$keys[] = '_new_meta_key';
			return $keys;
		} );

		// Without reset, the cached version is returned.
		$whitelist2 = MetaCompatibility::get_meta_whitelist();
		self::assertSame( $whitelist1, $whitelist2, 'Cached whitelist should be returned' );

		// After reset, the filter is applied.
		MetaCompatibility::reset();
		$whitelist3 = MetaCompatibility::get_meta_whitelist();
		self::assertContains( '_new_meta_key', $whitelist3, 'Filter should be applied after reset' );
	}
}
