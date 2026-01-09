# VIP Real-Time Collaboration

VIP Real-Time Collaboration (VIP RTC) enables multiple users to edit the same WordPress content simultaneously, using the Block Editor. Team members can collaborate on Posts, Pages, and Custom Post Types with near-instant updates, seeing each other's changes as they type and configure content.

## Table of Contents

- [Features](#features)
- [Supported content types](#supported-content-types)
- [Requirements](#requirements)
- [FAQ](#faq)
- [Development](#development)
- [Credits](#credits)

## Features

- **Real-Time Collaboration**: Multiple users can edit content simultaneously with instant updates
- **Smart Conflict Resolution**: Automatically merges changes to help prevent overwriting each other's work
- **Visual Collaboration Indicators**: See live cursors, user avatars, and editing activity from team members
- **Reliable Connection Management**: Graceful handling of network interruptions with automatic reconnection

## Supported content types

Out of the box, the plugin works with all WordPress posts and pages, including Custom Post Types.

### Customizing collaboration access

By default, users can collaborate on any content they have permission to edit. You can customize collaboration access using the `vip_rtc_post_sync_check_permission` filter to implement your own permission logic.

#### Restricting collaboration by post type

To exclude specific post types from real-time collaboration:

```php
add_filter( 'vip_rtc_post_sync_check_permission', function( $result, $post_id ) {
	// If previous checks failed, respect that
	if ( is_wp_error( $result ) ) {
		return $result;
	}

	$post_type = get_post_type( $post_id );
	$excluded_types = [ 'product', 'private_content' ];

	if ( in_array( $post_type, $excluded_types, true ) ) {
		return new WP_Error(
			'collaboration_disabled',
			'Real-time collaboration is not available for this content type.'
		);
	}

	return $result;
}, 10, 2 );
```

#### Restricting collaboration by user role

To limit collaboration to specific roles for certain post types:

```php
add_filter( 'vip_rtc_post_sync_check_permission', function( $result, $post_id ) {
	if ( is_wp_error( $result ) ) {
		return $result;
	}

	$post_type = get_post_type( $post_id );
	$current_user = wp_get_current_user();

	// Only allow editors and admins to collaborate on pages
	if ( 'page' === $post_type ) {
		$allowed_roles = [ 'editor', 'administrator' ];
		$user_roles = $current_user->roles;

		if ( empty( array_intersect( $allowed_roles, $user_roles ) ) ) {
			return new WP_Error(
				'insufficient_role',
				'Your user role does not have permission to collaborate on pages.'
			);
		}
	}

	return $result;
}, 10, 2 );
```

#### Other permission customizations

You can use the filter to implement various permission strategies:

```php
// Disable collaboration based on post meta
add_filter( 'vip_rtc_post_sync_check_permission', function( $result, $post_id ) {
	if ( is_wp_error( $result ) ) {
		return $result;
	}

	if ( get_post_meta( $post_id, '_disable_collaboration', true ) ) {
		return new WP_Error( 'collaboration_disabled', 'Collaboration disabled for this post.' );
	}

	return $result;
}, 10, 2 );

// Restrict by taxonomy terms
add_filter( 'vip_rtc_post_sync_check_permission', function( $result, $post_id ) {
	if ( is_wp_error( $result ) ) {
		return $result;
	}

	if ( has_term( 'sensitive', 'category', $post_id ) ) {
		return new WP_Error( 'sensitive_content', 'Collaboration not available for sensitive content.' );
	}

	return $result;
}, 10, 2 );
```

## Requirements

- **WordPress**: 6.7 or newer
- **Gutenberg**: This plugin currently requires a custom Gutenberg build ([latest release](https://github.com/Automattic/vip-go-mu-plugins-ext/tree/trunk/vip-integrations/gutenberg))
- **WebSocket server**: A WebSocket server facilitates real-time communication between peers. The [code is included in this repo](./websocket-server) but must be deployed separately.

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for development setup instructions.

## FAQ

### Do I need special permissions to collaborate?

No additional permissions are required. Users can collaborate on any content they already have permission to edit in WordPress.

### What happens if my internet connection drops?

The plugin handles brief connection interruptions gracefully. If the connection becomes particularly unstable, your editing session will be paused.

### How does conflict resolution work?

The plugin uses a [CRDT](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) to automatically merge changes from multiple users and prevent conflicts.

## Common Issues

Plugin development has historically been done with the understanding that only one user would be changing the data at a time. With Real Time Collaboration, this paradigm has changed. Some plugins, custom blocks, or other third-party code may have been written in ways that won't fully support data changing from other clients.

We will continue to update our [Common Issues](./docs/COMMON_ISSUES.md) doc with examples of problematic code and ways to improve it. The following prompt can be helpful to identify common issues in your codebase.

### AI Prompt for Identifying Common Issues in WordPress Plugins

```
Analyze this codebase to identify any components or code segments that may lead to issues as outlined in the [COMMON_ISSUES.md](https://raw.githubusercontent.com/Automattic/vip-real-time-collaboration/refs/heads/trunk/docs/COMMON_ISSUES.md). Provide suggestions for refactoring to ensure compatibility and optimal performance. Look through all files and identify any file that registers custom post meta or implements client-side custom WordPress blocks.
```

## Development

For development setup, contributing guidelines, and technical information, please see:

- [CONTRIBUTING.md](docs/CONTRIBUTING.md): Development setup and contribution guidelines
- [SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md): Technical architecture documentation
- [SECURITY.md](docs/SECURITY.md): Reporting security issues

## Credits

Parts of this work are derived from contributions made by Kevin Jahns in [this PR](https://github.com/WordPress/gutenberg/pull/68483).
