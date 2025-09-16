# VIP Real-Time Collaboration

VIP Real-Time Collaboration (VIP RTC) enables multiple users to edit the same WordPress content simultaneously. Team members can collaborate on Posts, Pages, and Custom Post Types with instant updates, seeing each other's changes as they type.

## Table of Contents

- [Features](#features)
- [Supported Content Types](#supported-content-types)
- [Requirements](#requirements)
- [Installation](#installation)
- [FAQ](#faq)
- [Development](#development)
- [Support](#support)
- [Credits](#credits)

## Features

- **Real-Time Collaboration**: Multiple users can edit content simultaneously with instant updates
- **Smart Conflict Resolution**: Automatically merges changes to prevent overwriting each other's work
- **Visual Collaboration Indicators**: See live cursors, user avatars, and editing activity from team members
- **Seamless WordPress Integration**: Uses existing WordPress permissions - no additional setup required
- **Reliable Connection Management**: Graceful handling of network interruptions with automatic reconnection

## Supported Content Types

The plugin works with:

- **Posts** - Standard WordPress blog posts
- **Pages** - Static WordPress pages
- **Custom Post Types** - Custom Post Types that support the Block Editor

> **Note**: The plugin is not currently compatible with the Site Editor (Full Site Editing).

## Requirements

- **WordPress**: 6.7 or newer
- **Gutenberg**: [Custom Gutenberg build with RTC features support](https://github.com/Automattic/gutenberg/tree/release/vip-rtc-0.1.0)
- **WebSocket Server**: For real-time communication between users
- **WordPress VIP**: Currently exclusive to VIP customers

## Installation

The plugin is currently exclusively available to WordPress VIP customers. To enable VIP Real-Time Collaboration:

1. Visit the [VIP Integrations Center](https://docs.wpvip.com/integrations/center/)
2. Enable Real-Time Collaboration with a few clicks
3. All required infrastructure and software will be automatically configured

## FAQ

### Do I need special permissions to collaborate?

No additional permissions are required. Users can collaborate on any content they already have permission to edit in WordPress.

### What happens if my internet connection drops?

The plugin handles connection interruptions gracefully. If the connection becomes particularly unstable, your editing session will be paused to protect the document's integrity.

### Can I see who made specific changes?

The plugin shows live editing activity and user presence. For detailed change tracking, you can use WordPress's built-in revision system.

### How does conflict resolution work?

The plugin uses advanced algorithms to automatically merge changes from multiple users, preventing conflicts and ensuring no work is lost.

## Development

For development setup, contributing guidelines, and technical information, please see:

- [CONTRIBUTING.md](docs/CONTRIBUTING.md) - Development setup and contribution guidelines
- [SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md) - Technical architecture documentation

## Support

Please contact VIP Support for technical issues or questions.

## Credits

Parts of this work are based on contributions made by Kevin Jahns, which can be found in [this PR](https://github.com/WordPress/gutenberg/pull/68483).
