# Contributing to VIP Real-Time Collaboration

Thank you for your interest in contributing to the VIP Real-Time Collaboration plugin! This document provides guidelines and information for developers who want to contribute to the project.

## Reporting security issues

Please see [SECURITY.md](SECURITY.md).

## Development Setup

### Prerequisites

- Custom Gutenberg build in sibling directory (`../gutenberg`)
  - This plugin currently requires a custom Gutenberg build ([latest release](https://github.com/Automattic/vip-go-mu-plugins-ext/tree/trunk/vip-integrations/gutenberg)). If you use our `wp-env`-based development environment, it expects this custom build to be present in a sibling directory named `gutenberg`.
  - If you use a different development environment, ensure the custom Gutenberg build is installed and active.
- Node.js
- Docker runtime and Docker Compose

### Running the development environment

Start the development environment:

```sh
npm run dev
```

This starts WordPress at `http://localhost:8888` and the local WebSocket server at `ws://localhost:1234`.

### Additional commands

- `npm run dev:stop` stops the development environment without destroying content
- `npm run dev:destroy` destroys the development environment and all content

### Constants and environment variables

The following PHP constants are automatically defined in our development environment:

| Variable                               | Value                    | Description                         |
| -------------------------------------- | ------------------------ | ----------------------------------- |
| `VIP_RTC_WS_URL`                       | `ws://localhost:1234`    | WebSocket URL for Yjs sync provider |
| `VIP_RTC_WS_AUTH_SECRET`               | `vip_rtc_ws_auth_secret` | Secret used to generate auth tokens |
| `VIP_RTC_WS_AUTH_TOKEN_EXPIRE_SECONDS` | `3600`                   | Auth token expiration in seconds    |

If you use a different development environment, ensure these variables are set accordingly. Note that `VIP_RTC_WS_AUTH_SECRET` must also be provided as an environment variable to the WebSocket server.

## Project Structure

- **bin/**: Development scripts for starting/stopping the local environment
- **build/**: Compiled JavaScript assets (generated)
- **inc/**: PHP includes and server-side functionality
- **src/**: TypeScript source files for the front-end components
- **tests/**: Tests for validating the plugin's functionalities
- **websocket-server/**: A development Node.js WebSocket server
- **yjs-inspector/**: Development tool for inspecting Yjs document state

## Debugging

### Yjs Inspector

The development environment includes a Yjs Inspector tool for debugging collaborative document state. When you open a post in the editor, a link to the Yjs Inspector will be logged in your browser's development console. This link opens a web interface where you can inspect the current state ofthe Yjs document, view document history, and debug synchronization issues.

## Guidelines

### Code quality

- Follow the existing code style and conventions
- Run `npm run lint` to check for linting issues
- Use `npm run format` to automatically format code
- Ensure TypeScript types are correct with `npm run check-types`
- Ensure all tests pass before committing

### Testing

- Write unit or integration tests for new functionality
- Run the full test suite before submitting changes:
  - `npm run test` for PHP and TypeScript tests
  - `npm run test:e2e` for end-to-end tests (use `npm run test:e2e:debug` for interactive debugging)

## Technical Architecture

For a comprehensive understanding of the system architecture, please refer to [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md).
