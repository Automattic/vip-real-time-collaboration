<?php

Namespace VIPRealtimeCollaboration\Overrides;
/**
 * Allow multiple users to edit the same post at the same time.
 *
 * @package WPVIP\Real_Time_Collaboration
 */

// Allow multiple users to see the edit post screen. There is a bug with this however, when autosave kicks in, see: https://core.trac.wordpress.org/ticket/63598.
add_filter( 'show_post_locked_dialog', '__return_false' );

// Force the removal of refreshing the post lock, runs on admin_init as that is after the filter is set.
add_action( 'admin_init', __NAMESPACE__ . '\\remove_heartbeat_post_lock' );

/**
 * Remove the heartbeat post lock functionality.
 *
 * @return void
 */
function remove_heartbeat_post_lock(): void {
	remove_filter( 'heartbeat_received', 'wp_refresh_post_lock' );
}
