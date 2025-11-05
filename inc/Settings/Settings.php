<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Settings;

defined( 'ABSPATH' ) || exit();

final class Settings {
	private const SETTINGS_PAGE_SLUG = 'vip-real-time-collaboration-settings';
	public const OPTION_NAME = 'vip_real_time_collaboration_settings';

	public function __construct() {
		add_action( 'admin_init', [ $this, 'register_settings' ] );
		add_action( 'admin_menu', [ $this, 'add_options_page' ] );
	}

	public static function is_vip_rtc_enabled(): bool {
		/** @var array<string> */
		$options = get_option( self::OPTION_NAME, [] );

		return isset( $options['enable-vip-rtc'] ) && (bool) $options['enable-vip-rtc'];
	}

	/**
	 * Get the default options for the plugin.
	 *
	 * @return array The default options.
	 */
	public static function get_default_options(): array {
		$default_options = [];

		$default_options['enable-vip-rtc'] = true;

		return $default_options;
	}

	/**
	 * Sanitize settings before saving.
	 *
	 * @psalm-suppress PossiblyUnusedReturnValue Psalm does not detect usage via add_filter.
	 *
	 * @param array $input The input values from the form.
	 *
	 * @return array The sanitized settings.
	 */
	public static function sanitize_settings( ?array $input = [] ): array {
		$sanitized = [];

		// Handle checkbox - if not set in input, it means unchecked.
		$sanitized['enable-vip-rtc'] = isset( $input['enable-vip-rtc'] ) && '1' === $input['enable-vip-rtc'];

		return $sanitized;
	}

	/**
	 * Register the settings for the settings page
	 */
	public static function register_settings(): void {
		register_setting(
			self::SETTINGS_PAGE_SLUG,
			self::OPTION_NAME,
			[
				'type' => 'array',
				'default' => self::get_default_options(),
				'sanitize_callback' => [ __CLASS__, 'sanitize_settings' ],
			]
		);

		// Add instructions section.
		add_settings_section(
			'plugin-settings',
			'',
			[ __CLASS__, 'display_settings_instructions' ],
			self::SETTINGS_PAGE_SLUG
		);

		/** @psalm-suppress InvalidArgument */ // WordPress Settings API allows custom args.
		add_settings_field(
			'enable-vip-rtc',
			__( 'Enable VIP Real-Time Collaboration', 'vip-real-time-collaboration' ),
			[ __CLASS__, 'display_settings_checkbox' ],
			self::SETTINGS_PAGE_SLUG,
			'plugin-settings',
			[
				'label' => __( 'Enable the VIP Real-Time Collaboration plugin', 'vip-real-time-collaboration' ),
				'id' => 'enable-vip-rtc',
			]
		);
	}

	/**
	 * Add the settings page to the WordPress admin menu.
	 */
	public static function add_options_page(): void {
		add_options_page(
			__( 'VIP Real-Time Collaboration Settings', 'vip-real-time-collaboration' ),
			__( 'VIP Real-Time Collaboration', 'vip-real-time-collaboration' ),
			'manage_options',
			self::SETTINGS_PAGE_SLUG,
			[ __CLASS__, 'settings_page_content' ]
		);
	}

	/**
	 * Display the settings page content.
	 */
	public static function settings_page_content(): void {
		?>
		<div id="vip-real-time-collaboration-settings-wrapper" class="wrap">
			<h1><?php esc_html_e( 'VIP Real-Time Collaboration Settings', 'vip-real-time-collaboration' ); ?></h1>
			<?php settings_errors(); ?>
			<form action="options.php" method="post">
				<?php
				settings_fields( self::SETTINGS_PAGE_SLUG );
				do_settings_sections( self::SETTINGS_PAGE_SLUG );
				submit_button();
				?>
			</form>
		</div>
		<?php
	}

	/**
	 * Display a checkbox field.
	 *
	 * @param array{id: string, label: string, default?: bool} $args Field arguments (label, id, default).
	 */
	public static function display_settings_checkbox( array $args ): void {
		/** @var array<string> */
		$options = get_option( self::OPTION_NAME, [] );
		$value = isset( $options[ $args['id'] ] ) ? (bool) $options[ $args['id'] ] : true;
		$field_name = self::OPTION_NAME . '[' . $args['id'] . ']';
		?>
		<label for="<?php echo esc_attr( $args['id'] ); ?>">
			<input
				type="checkbox"
				name="<?php echo esc_attr( $field_name ); ?>"
				id="<?php echo esc_attr( $args['id'] ); ?>"
				value="1"
				<?php checked( $value ); ?>
			/>
			<?php echo esc_html( $args['label'] ); ?>
		</label>
		<?php
	}

	/**
	 * Display settings instructions.
	 */
	public static function display_settings_instructions(): void {
		?>
		<p><?php esc_html_e( 'Configure the settings for the VIP Real-Time Collaboration plugin below.', 'vip-real-time-collaboration' ); ?></p>
		<?php
	}
}
