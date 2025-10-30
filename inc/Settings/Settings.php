<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Settings;

defined( 'ABSPATH' ) || exit();

final class Settings {
	private const SETTINGS_PAGE_SLUG = 'vip-real-time-collaboration-settings';
	private const OPTION_NAME = 'vip_real_time_collaboration_settings';

	/**
	 * Get settings configuration.
	 *
	 * Returns settings configuration with translated strings.
	 * This method approach allows us to use literal strings with __() for i18n tools.
	 *
	 * @return array<array{
	 *   id: string,
	 *   title: string,
	 *   description?: string,
	 *   fields?: array<array{id: string, title: string, label: string, default?: bool}>,
	 *   subsections?: array<array{id: string, title: string, fields: array<array{id: string, title: string, label: string, default?: bool}>}>
	 * }>
	 */
	private static function get_settings_config(): array {
		return [
			[
				'id' => 'awareness-settings',
				'title' => __( 'Awareness', 'vip-real-time-collaboration' ),
				'description' => __( 'Configure how you see other collaborators while editing.', 'vip-real-time-collaboration' ),
				'fields' => [
					[
						'id' => 'enable-awareness-avatars',
						'title' => __( 'Enable awareness avatars', 'vip-real-time-collaboration' ),
						'label' => __( 'Show avatars of other users currently editing the post', 'vip-real-time-collaboration' ),
					],
					[
						'id' => 'enable-awareness-cursors',
						'title' => __( 'Enable awareness cursors', 'vip-real-time-collaboration' ),
						'label' => __( 'Show cursors of other users currently editing the post', 'vip-real-time-collaboration' ),
					],
					[
						'id' => 'enable-self-awareness',
						'title' => __( 'Enable self awareness', 'vip-real-time-collaboration' ),
						'label' => __( 'Show your own cursor while editing', 'vip-real-time-collaboration' ),
						'default' => false,
					],
				],
			],
			[
				'id' => 'notifications-settings',
				'title' => __( 'Notifications', 'vip-real-time-collaboration' ),
				'description' => __( 'Configure notifications you receive in the block editor.', 'vip-real-time-collaboration' ),
				'subsections' => [
					[
						'id' => 'collaborator-notifications-settings',
						'title' => __( 'Collaborators', 'vip-real-time-collaboration' ),
						'fields' => [
							[
								'id' => 'enable-user-enter-notification',
								'title' => __( 'User enters', 'vip-real-time-collaboration' ),
								'label' => __( 'Show notifications when other users start editing the post', 'vip-real-time-collaboration' ),
							],
							[
								'id' => 'enable-user-exit-notification',
								'title' => __( 'User exits', 'vip-real-time-collaboration' ),
								'label' => __( 'Show notifications when other users stop editing the post', 'vip-real-time-collaboration' ),
								'default' => false,
							],
						],
					],
				],
			],
		];
	}

	public function __construct() {
		add_action( 'admin_init', [ __CLASS__, 'initialize_options' ] );
		add_action( 'admin_init', [ __CLASS__, 'register_settings' ] );
		add_action( 'admin_menu', [ __CLASS__, 'add_options_page' ] );
	}

	public static function initialize_options(): void {
		$default_options = self::get_default_options();

		/** @var array<string> */
		$existing_options = get_option( self::OPTION_NAME, [] );

		// Add default options if they don't exist.
		if ( empty( $existing_options ) ) {
			add_option( self::OPTION_NAME, $default_options );
		}
	}

	public static function get_default_options(): array {
		$default_options = [];

		// Build default options from settings configuration.
		foreach ( self::get_settings_config() as $section ) {
			// Fields in the main section.
			if ( isset( $section['fields'] ) ) {
				foreach ( $section['fields'] as $field ) {
					$default_options[ $field['id'] ] = $field['default'] ?? true;
				}
			}

			// Fields in subsections.
			if ( isset( $section['subsections'] ) ) {
				foreach ( $section['subsections'] as $subsection ) {
					if ( isset( $subsection['fields'] ) ) {
						foreach ( $subsection['fields'] as $field ) {
							$default_options[ $field['id'] ] = $field['default'] ?? true;
						}
					}
				}
			}
		}

		return $default_options;
	}

	public static function register_settings(): void {
		register_setting( self::SETTINGS_PAGE_SLUG, self::OPTION_NAME );

		// Add instructions section.
		add_settings_section(
			'plugin-settings',
			'',
			[ __CLASS__, 'display_settings_instructions' ],
			self::SETTINGS_PAGE_SLUG
		);

		// Register all sections and fields from configuration.
		foreach ( self::get_settings_config() as $section ) {
			self::register_section( $section );
		}
	}

	/**
	 * Register a settings section and its fields.
	 *
	 * @param array{
	 *   id: string,
	 *   title: string,
	 *   description?: string,
	 *   fields?: array<array{id: string, title: string, label: string, default?: bool}>,
	 *   subsections?: array<array{id: string, title: string, fields: array<array{id: string, title: string, label: string, default?: bool}>}>
	 * } $section_config Section configuration array.
	 */
	private static function register_section( array $section_config ): void {
		// Register the main section.
		add_settings_section(
			$section_config['id'],
			$section_config['title'],
			[ __CLASS__, 'render_section_description' ],
			self::SETTINGS_PAGE_SLUG
		);

		// Register fields for this section.
		if ( isset( $section_config['fields'] ) ) {
			foreach ( $section_config['fields'] as $field ) {
				self::register_field( $field, $section_config['id'] );
			}
		}

		// Register subsections if they exist.
		if ( isset( $section_config['subsections'] ) ) {
			foreach ( $section_config['subsections'] as $subsection ) {
				add_settings_section(
					$subsection['id'],
					$subsection['title'],
					'__return_null',
					self::SETTINGS_PAGE_SLUG
				);

				if ( isset( $subsection['fields'] ) ) {
					foreach ( $subsection['fields'] as $field ) {
						self::register_field( $field, $subsection['id'] );
					}
				}
			}
		}
	}

	/**
	 * Register a settings field.
	 *
	 * @param array{id: string, title: string, label: string, default?: bool} $field_config Field configuration array.
	 * @param string $section_id Section identifier.
	 */
	private static function register_field( array $field_config, string $section_id ): void {
		/** @psalm-suppress InvalidArgument */ // WordPress Settings API allows custom args.
		add_settings_field(
			$field_config['id'],
			$field_config['title'],
			[ __CLASS__, 'display_settings_checkbox' ],
			self::SETTINGS_PAGE_SLUG,
			$section_id,
			[
				'label' => $field_config['label'],
				'id' => $field_config['id'],
				'default' => $field_config['default'] ?? true,
			]
		);
	}

	/**
	 * Render section description.
	 *
	 * @param array $args Section arguments.
	 */
	public static function render_section_description( array $args ): void {
		// Find the section configuration by ID.
		foreach ( self::get_settings_config() as $section ) {
			if ( $section['id'] === $args['id'] && isset( $section['description'] ) ) {
				?>
				<p class="description"><?php echo esc_html( $section['description'] ); ?></p>
				<?php
				return;
			}
		}
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
		$value = isset( $options[ $args['id'] ] ) ? (bool) $options[ $args['id'] ] : ( $args['default'] ?? true );
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
