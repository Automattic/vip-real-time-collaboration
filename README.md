# VIP Realtime Collaboration

A realtime collaboration plugin made by VIP for enhancing the Block Editor experience with real-time collaborative editing capabilities.

The `sync-engine` is based on the work done by Kevin Jahns that can be found in [this PR](https://github.com/WordPress/gutenberg/pull/68483).

## What's in this repo

- **sync-engine/**: Core collaboration engine with WebSocket and IndexedDB integration
- **bin/**: Development scripts for starting/stopping the local environment
- **inc/**: PHP includes and server-side functionality
- **src/**: TypeScript source files for the frontend components
- **build/**: Compiled JavaScript assets (generated)

## Setup Instructions

### Prerequisites
- WordPress 6.7+
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

3. Build for production:
   ```bash
   npm run build
   ```

### Available Commands

- `npm run dev` - Start development environment
- `npm run build` - Build production assets
- `npm run lint` - Run linting checks
- `npm run format` - Format code
- `npm run check-types` - TypeScript type checking
- `npm run plugin-zip` - Create plugin zip for distribution
