<?php declare(strict_types = 1);

namespace VIPRealTimeCollaboration\Settings;

defined( 'ABSPATH' ) || exit();

final class Settings {
	public function __construct() {
		add_action( 'admin_init', [ $this, 'register_settings' ] );
		add_action( 'admin_menu', [ $this, 'add_options_page' ] );
	}

	public static function register_settings(): void {
		register_setting( 'vip-real-time-collaboration-settings', 'vip_real_time_collaboration_settings' );

		$section_id = 'plugin-settings';
		add_settings_section( $section_id, __( 'Plugin Settings', 'vip-real-time-collaboration' ), '__return_null', 'vip-real-time-collaboration-settings' );

		// Example setting field: Enable Real-Time Collaboration
		add_settings_field(
			'enable-real-time-collaboration',
			__( 'Enable Real-Time Collaboration', 'vip-real-time-collaboration' ),
			function (): void {
				$options = get_option( 'vip_real_time_collaboration_settings' );
				$enabled = isset( $options['enable-real-time-collaboration'] ) ? (bool) $options['enable-real-time-collaboration'] : true;
				?>
				<input type="checkbox" name="vip_real_time_collaboration_settings[enable-real-time-collaboration]" value="1" <?php checked( $enabled, true ); ?> />
				<?php
			},
			'vip-real-time-collaboration-settings',
			$section_id
		);
	}

	public static function add_options_page(): void {
		add_options_page(
			__( 'VIP Real-Time Collaboration Settings', 'vip-real-time-collaboration' ),
			__( 'VIP Real-Time Collaboration', 'vip-real-time-collaboration' ),
			'manage_options',
			'vip-real-time-collaboration-settings',
			[ __CLASS__, 'settings_page_content' ]
		);
	}

	public static function settings_page_content(): void {
		?>
		<div id="vip-real-time-collaboration-settings-wrapper">
			<h1><?php esc_html_e( 'VIP Real-Time Collaboration', 'vip-real-time-collaboration' ); ?></h1>
			<p><i>Configure the settings for the VIP Real-Time Collaboration plugin below.</i></p>
			<?php settings_errors(); ?>
			<form action="options.php" method="post">
				<?php
				settings_fields( 'vip-real-time-collaboration-settings' );
				do_settings_sections( 'vip-real-time-collaboration-settings' );
				submit_button();
				?>
			</form>
		</div>
		<?php
	}
}
