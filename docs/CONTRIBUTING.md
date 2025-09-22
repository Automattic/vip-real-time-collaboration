# Contributing to VIP Real-Time Collaboration

Thank you for your interest in contributing to the VIP Real-Time Collaboration plugin! This document provides guidelines and information for developers who want to contribute to the project.

## Development Setup

### Prerequisites

- WordPress 6.7+
- Gutenberg plugin (see [here](#custom-gutenberg-development))
- PHP 8.2+
- Node.js and npm
- MySQL 8.0+ or MariaDB 10.6+ (for integration tests)

### Project Initialization

After cloning the repo, initialize the project by following these steps:

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Initialize husky:**

   ```bash
   npx husky init
   ```

   You may have to run this command to make the pre-commit hook operational. This will overwrite the `.husky/pre-commit` file, which you can revert after running the command.

### Running the development environment

To start a fully working development environment:

1. **Start the WordPress development environment:**

   ```bash
   npm run dev
   ```

   This starts WordPress at `http://localhost:8888`.

2. **Start the local WebSocket server:**

   ```bash
   npm run dev:websocket-server
   ```

   This Starts the local WebSocket server at `ws://localhost:1234`.

### Custom Gutenberg Development

This plugin is built on top of the `add/experimental-collaborative-editing` branch, from the Gutenberg fork [here](https://github.com/Automattic/gutenberg/tree/add/experimental-collaborative-editing).

If you want to develop against a custom build of Gutenberg, copy `.wp-env.override.gutenberg-dev.json` to `.wp-env.override.json` and re-run `npm run dev`. This file assumes Gutenberg is checked out in a sibling folder of this project named `gutenberg`; adjust the path accordingly, if needed. Make sure to start the development build of Gutenberg.

## Available Commands

This section lists a selection of available commands. You may find additional commands in the [package.json](../package.json) file.

### Development

- `npm run dev` - Start development environment
- `npm run dev:stop` - Stop the development environment
- `npm run start` - Start webpack dev server with hot reload
- `npm run dev:websocket-server` - Start the WebSocket server for real-time collaboration
- `npm run dev:yjs-inspector` - Start the Yjs state inspector tool

### Code Quality & Linting

- `npm run lint` - Run all linting checks (JavaScript, CSS, PHP, TypeScript)
- `npm run format` - Format code according to project standards
- `npm run format:check` - Check if code is properly formatted
- `npm run check-types` - TypeScript type checking
- `npm run lint:js` - Run JavaScript/TypeScript linting only
- `npm run lint:php` - Run PHP linting (PHPCodeSniffer + Psalm)

### Testing

- `npm run test:e2e` - Run end-to-end tests
- `npm run test:e2e:debug` - Debug end-to-end tests in Playwright UI
- `composer testwp-install` - Install integration test files and database (needed to run the tests)
- `composer testwp` - Run PHP integration tests
- `composer testwp-coverage` - Run PHP integration tests with code coverage
- `composer testwp-experimental` - Run PHP integration tests in experimental mode (ignores possible deprecation errors)

## Environment Variables

The following environment variables are used during development:

| Variable                 | Default | Development              | Description                               |
| ------------------------ | ------- | ------------------------ | ----------------------------------------- |
| `VIP_RTC_WS_URL`         | `null`  | `ws://localhost:1234`    | WebSocket URL for Yjs sync provider       |
| `VIP_RTC_WS_AUTH_SECRET` | `null`  | `vip_rtc_ws_auth_secret` | Authentication token for WebSocket server |

## Project Structure

- **bin/**: Development scripts for starting/stopping the local environment
- **inc/**: PHP includes and server-side functionality
- **src/**: TypeScript source files for the front-end components
- **tests/**: Tests for validating the plugin's functionalities
- **websocket-server/**: A development Node.js WebSocket server
- **yjs-inspector/**: Development tool for inspecting Yjs document state
- **build/**: Compiled JavaScript assets (generated)

## Debugging Tools

### Yjs Inspector

The project includes a Yjs Inspector tool for debugging collaborative document state:

```bash
npm run dev:yjs-inspector
```

This opens a web interface where you can inspect the current state of Yjs documents, view document history, and debug synchronization issues.

### WebSocket Server Metrics

The development WebSocket server includes basic metrics and logging:

```bash
npm run dev:websocket-server
```

Monitor the console output for connection events, message counts, and error logs.

## Development Guidelines

### Code Quality

- Follow the existing code style and conventions
- Use `npm run format` to automatically format code
- Ensure TypeScript types are correct with `npm run check-types`
- Ensure all tests pass before committing
- The project uses Husky for pre-commit hooks, running linting on staged files

### Testing

- Write tests for new functionality
- Run the full test suite before submitting changes:
  - `npm run test:e2e` for end-to-end tests (use `npm run test:e2e:debug` for interactive debugging)
  - `composer testwp` for PHP integration tests

## Troubleshooting

### Common Issues

**WordPress environment fails to start:**

- Ensure Docker is running on your system
- Try `npm run dev:destroy` followed by `npm run dev` to reset the environment
- Check that ports 8888 and 1234 are not in use by other applications

**WebSocket connection issues:**

- Verify the WebSocket server is running with `npm run dev:websocket-server`
- Check that `VIP_RTC_WS_URL` is set to `ws://localhost:1234` in your environment
- Ensure firewall isn't blocking WebSocket connections

**Gutenberg custom build issues:**

- Make sure you're using the correct Gutenberg branch: `add/experimental-collaborative-editing`
- Verify the Gutenberg development build is running
- Check that the override file path points to the correct Gutenberg directory

**Linting failures:**

- Run `npm run format` to auto-fix formatting issues
- Run individual linting commands to isolate the problem:
  - `npm run lint:js` for JavaScript/TypeScript
  - `npm run lint:php` for PHP
- Check that all dependencies are properly installed

**Integration tests do not run:**

- Make sure you have a database per the [Prerequisites](#prerequisites) section
- before running `composer testwp`, you need to install the required files and database using `composer testwp-install`
- `composer testwp-install` adds files to a temporary directory, so you may need to run it again if you have rebooted

## Technical Architecture

For a comprehensive understanding of the system architecture, please refer to [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md).
