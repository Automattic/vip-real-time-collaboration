<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Compatibility;

defined( 'ABSPATH' ) || exit();

/**
 * Enables third-party plugin meta fields to work with Gutenberg's core-data store
 * by forcing show_in_rest: true on whitelisted meta keys.
 *
 * This class works in conjunction with the JavaScript meta-sync module which
 * bridges third-party plugin stores (like Yoast SEO) to core-data, enabling
 * real-time collaboration for plugins that don't natively use core-data.
 *
 * @see https://developer.wordpress.org/block-editor/how-to-guides/metabox/
 */
final class MetaCompatibility {
	/**
	 * Default meta keys to enable for REST API access.
	 *
	 * These keys have corresponding JavaScript bridges in the meta-sync module
	 * that handle real-time synchronization. To add custom meta keys, use:
	 *
	 * ```php
	 * add_filter( 'vip_rtc_meta_whitelist', function( $keys ) {
	 *     $keys[] = '_my_plugin_meta_key';
	 *     return $keys;
	 * } );
	 * ```
	 *
	 * Note: Custom meta keys also need a JavaScript bridge to sync in real-time.
	 *
	 * @var array<string>
	 */
	private const DEFAULT_META_WHITELIST = [
		// Yoast SEO meta keys (synced via yoast-seo-bridge.ts)
		'_yoast_wpseo_title',
		'_yoast_wpseo_metadesc',
		'_yoast_wpseo_focuskw',
	];

	/**
	 * Cached whitelist after applying filters.
	 *
	 * @var array<string>|null
	 */
	private static ?array $meta_whitelist = null;

	/**
	 * Constructor to initialize the meta compatibility hooks.
	 */
	public function __construct() {
		// Hook early to intercept meta registration.
		add_filter( 'register_meta_args', [ $this, 'maybe_enable_show_in_rest' ], 10, 4 );

		// Handle already-registered meta on init (late priority).
		add_action( 'init', [ $this, 'update_existing_meta_registration' ], 999 );
	}

	/**
	 * Get the whitelist of meta keys to enable for REST API.
	 *
	 * @return array<string>
	 */
	public static function get_meta_whitelist(): array {
		if ( null !== self::$meta_whitelist ) {
			return self::$meta_whitelist;
		}

		/**
		 * Filter the list of meta keys to enable for REST API sync.
		 *
		 * @param array<string> $meta_keys Array of meta key names to enable.
		 * @psalm-suppress MixedAssignment WordPress apply_filters returns mixed.
		 */
		$filtered = apply_filters(
			'vip_rtc_meta_whitelist',
			self::DEFAULT_META_WHITELIST
		);

		$whitelist = is_array( $filtered ) ? array_filter( $filtered, 'is_string' ) : self::DEFAULT_META_WHITELIST;

		self::$meta_whitelist = $whitelist;

		return self::$meta_whitelist;
	}

	/**
	 * Check if a meta key should be enabled for REST API access.
	 *
	 * @param string $meta_key The meta key to check.
	 */
	public static function is_meta_whitelisted( string $meta_key ): bool {
		return in_array( $meta_key, self::get_meta_whitelist(), true );
	}

	/**
	 * Filter callback to enable show_in_rest for whitelisted meta keys.
	 *
	 * @param array<string, mixed> $args        Array of arguments for registering the meta key.
	 * @param array<string, mixed> $defaults    Array of default values for the register_meta() args.
	 * @param string               $object_type Type of object (post, comment, term, user).
	 * @param string               $meta_key    Meta key being registered.
	 * @return array<string, mixed> Modified arguments.
	 *
	 * @psalm-suppress PossiblyUnusedReturnValue Return value used by WordPress filter.
	 * @psalm-suppress UnusedParam $defaults required by filter signature.
	 */
	public function maybe_enable_show_in_rest( array $args, array $defaults, string $object_type, string $meta_key ): array {
		// Only process post meta.
		if ( 'post' !== $object_type ) {
			return $args;
		}

		// Check if this meta key is whitelisted.
		if ( ! self::is_meta_whitelisted( $meta_key ) ) {
			return $args;
		}

		// Skip if already enabled.
		if ( ! empty( $args['show_in_rest'] ) ) {
			return $args;
		}

		/**
		 * Filter whether to enable a specific meta key for REST API.
		 *
		 * @param bool                 $enable   Whether to enable the meta key.
		 * @param string               $meta_key The meta key.
		 * @param array<string, mixed> $args     The registration arguments.
		 */
		$enable = (bool) apply_filters( 'vip_rtc_enable_meta_key', true, $meta_key, $args );

		if ( ! $enable ) {
			return $args;
		}

		// Enable show_in_rest and set safe defaults.
		$args['show_in_rest'] = true;
		$args = self::ensure_rest_defaults( $args, $meta_key );

		return $args;
	}

	/**
	 * Update already-registered meta keys to enable show_in_rest.
	 * Runs on init at priority 999 to catch meta registered earlier.
	 */
	public function update_existing_meta_registration(): void {
		global $wp_meta_keys;

		if ( ! is_array( $wp_meta_keys ) || ! isset( $wp_meta_keys['post'] ) ) {
			return;
		}

		/** @psalm-suppress MixedAssignment Global $wp_meta_keys has mixed types. */
		foreach ( $wp_meta_keys['post'] as $subtype => $meta_keys ) {
			if ( ! is_array( $meta_keys ) ) {
				continue;
			}

			/** @psalm-suppress MixedAssignment Global $wp_meta_keys has mixed types. */
			foreach ( $meta_keys as $meta_key => $meta_args ) {
				// Ensure meta_key is a string and meta_args is an array.
				if ( ! is_string( $meta_key ) || ! is_array( $meta_args ) ) {
					continue;
				}

				// Skip if not whitelisted.
				if ( ! self::is_meta_whitelisted( $meta_key ) ) {
					continue;
				}

				// Skip if already enabled.
				if ( ! empty( $meta_args['show_in_rest'] ) ) {
					continue;
				}

				/**
				 * Filter whether to enable a specific existing meta key for REST API.
				 *
				 * @param bool   $enable   Whether to enable the meta key.
				 * @param string $meta_key The meta key.
				 * @param string $subtype  The post subtype ('' for all post types).
				 */
				$enable = (bool) apply_filters( 'vip_rtc_enable_existing_meta_key', true, $meta_key, $subtype );

				if ( ! $enable ) {
					continue;
				}

				// Update the global directly.
				/** @psalm-suppress MixedArgumentTypeCoercion Global $wp_meta_keys has mixed types. */
				$updated_args = self::ensure_rest_defaults( $meta_args, $meta_key );
				$updated_args['show_in_rest'] = true;
				/** @psalm-suppress MixedArrayOffset, MixedArrayAssignment Global $wp_meta_keys has mixed types. */
				$wp_meta_keys['post'][ $subtype ][ $meta_key ] = $updated_args;
			}
		}
	}

	/**
	 * Ensure proper defaults are set for REST API compatibility.
	 *
	 * @param array<string, mixed> $args     The meta registration arguments.
	 * @param string               $meta_key The meta key (reserved for future use).
	 * @return array<string, mixed> Modified arguments with safe defaults.
	 *
	 * @psalm-suppress UnusedParam $meta_key reserved for future per-key customization.
	 */
	private static function ensure_rest_defaults( array $args, string $meta_key ): array {
		// Set type if not defined (defaults to string for safety).
		if ( ! isset( $args['type'] ) || '' === $args['type'] ) {
			$args['type'] = 'string';
		}

		// Ensure single is set (most plugin meta is single).
		if ( ! isset( $args['single'] ) ) {
			$args['single'] = true;
		}

		// Set a secure auth_callback if not defined.
		if ( ! isset( $args['auth_callback'] ) ) {
			/**
			 * @psalm-suppress UnusedClosureParam Parameters required by auth_callback signature.
			 */
			// phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed -- Parameters required by auth_callback signature.
			$args['auth_callback'] = static function (
				bool $allowed,
				string $meta_key,
				int $object_id,
				int $user_id,
				string $cap,
				array $caps
			): bool {
				// Only allow if user can edit the post.
				return current_user_can( 'edit_post', $object_id );
			};
		}

		// Ensure sanitize_callback is set for security.
		if ( ! isset( $args['sanitize_callback'] ) ) {
			/**
			 * @psalm-suppress UnusedClosureParam Parameters required by sanitize_callback signature.
			 */
			$args['sanitize_callback'] = static function ( mixed $value, string $meta_key ): mixed { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed
				if ( is_string( $value ) ) {
					return sanitize_text_field( $value );
				}
				return $value;
			};
		}

		return $args;
	}

	/**
	 * Reset the cached whitelist. Useful for testing.
	 *
	 * @psalm-suppress PossiblyUnusedMethod Used in tests.
	 */
	public static function reset(): void {
		self::$meta_whitelist = null;
	}
}
