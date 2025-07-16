# VIP Realtime Collaboration

A realtime collaboration plugin made by VIP for enhancing the Block Editor experience with real-time collaborative editing capabilities.

The `sync-engine` is based on the work done by Kevin Jahns that can be found in [this PR](https://github.com/WordPress/gutenberg/pull/68483).

## What's in this repo

- **bin/**: Development scripts for starting/stopping the local environment
- **inc/**: PHP includes and server-side functionality
- **src/**: TypeScript source files for the frontend components
- **websocket-server/**: A development Node.js WebSocket server
- **build/**: Compiled JavaScript assets (generated)

## Setup Instructions

### Prerequisites

- WordPress 6.7+
- Gutenberg 18.6+
- PHP 8.2+
- Node.js and npm

### Development Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development environment:

   ```bash
   npm run dev
   ```

   This starts WordPress at `http://localhost:8888`

### Custom Gutenberg Development

If you want to develop against a custom build of Gutenberg, copy `.wp-env.override.gutenberg-dev.json` to `.wp-env.override.json` and re-run `npm run dev`. This file assumes Gutenberg is checked out in a sibling folder of this project named `gutenberg`; adjust the path accordingly, if needed. Make sure to start the development build of Gutenberg.

### Available Commands

- `npm run dev` - Start development environment
- `npm run build` - Build production assets
- `npm run lint` - Run linting checks
- `npm run format` - Format code
- `npm run check-types` - TypeScript type checking
- `npm run plugin-zip` - Create plugin zip for distribution

### Environment Variables

`VIP_RTC_WS_URL`: This is the websockets url that'll be used as the sync provider by Yjs. By default, it's null. On local dev environments, it's set to `ws://localhost:1234`.


---- TEST ---