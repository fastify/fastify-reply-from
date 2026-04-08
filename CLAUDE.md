# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

@fastify/reply-from is a Fastify plugin that forwards HTTP requests to another server, supporting HTTP/1.1, HTTP/2, and various client configurations including undici, Node.js http/https agents, and unix sockets.

## Common Commands

### Testing
- `npm test` - Run all tests (unit + TypeScript)
- `npm run test:unit` - Run unit tests with tap
- `npm run test:typescript` - Run TypeScript definition tests with tsd

### Code Quality  
- `npm run lint` - Run standard linter with snazzy formatter
- `npm run lint:fix` - Auto-fix linting issues

### Development
- Tests are located in `test/` directory with `.test.js` extension
- Test coverage thresholds: 96% lines, 96% statements, 96% branches, 97% functions (configured in `.taprc`)
- Uses `tap` as the test framework
- Pre-commit hooks run lint and test automatically

## Architecture

### Core Files
- `index.js` - Main plugin entry point with `reply.from()` decorator
- `lib/request.js` - HTTP client abstraction supporting HTTP/1.1, HTTP/2, and undici
- `lib/utils.js` - Header manipulation and URL building utilities  
- `lib/errors.js` - Custom error classes for different failure scenarios

### Key Components

#### Request Handling (`index.js`)
- Decorates Fastify reply with `from(source, opts)` method
- Handles request/response transformation via configurable hooks
- Implements retry logic with exponential backoff for failed requests
- Supports URL caching to optimize performance (configurable via `cacheURLs` option)

#### HTTP Client Layer (`lib/request.js`)
- **HTTP/1.1**: Uses Node.js `http`/`https` modules with custom agents
- **HTTP/2**: Uses Node.js `http2` module with session management  
- **Undici**: High-performance HTTP client with connection pooling
- **Unix Sockets**: Supports `unix+http:` and `unix+https:` protocols
- Automatic protocol selection based on configuration

#### Utilities (`lib/utils.js`)
- `filterPseudoHeaders()` - Removes HTTP/2 pseudo-headers for HTTP/1.1 compatibility
- `stripHttp1ConnectionHeaders()` - Removes connection-specific headers for HTTP/2
- `copyHeaders()` - Safely copies headers to Fastify reply
- `buildURL()` - Constructs target URLs with base URL validation

### Plugin Options
- `base` - Base URL for all forwarded requests (required for HTTP/2)
- `undici` - Enable/configure undici client (boolean or options object)
- `http`/`http2` - Configure Node.js HTTP clients
- `retryMethods` - HTTP methods to retry on socket errors (default: GET, HEAD, OPTIONS, TRACE)
- `retriesCount` - Number of retries for socket hangup errors
- `maxRetriesOn503` - Retry limit for 503 Service Unavailable responses

### Request/Response Hooks
- `onResponse(request, reply, res)` - Transform response before sending
- `onError(reply, error)` - Handle request errors
- `rewriteHeaders(headers, request)` - Modify response headers
- `rewriteRequestHeaders(request, headers)` - Modify request headers
- `getUpstream(request, base)` - Dynamic upstream selection

### Error Handling
Custom error classes in `lib/errors.js`:
- `TimeoutError` - Request timeout (→ 504 Gateway Timeout)
- `ServiceUnavailableError` - Connection failures (→ 503 Service Unavailable)
- `ConnectionResetError` - Socket reset (→ 502 Bad Gateway)
- `GatewayTimeoutError` - Headers timeout (→ 504 Gateway Timeout)

## Compatibility Notes
- Requires Fastify 4.x
- Incompatible with `@fastify/multipart` when registered as sibling plugins (warning issued on startup)
- Supports both CommonJS and ESM via dual exports