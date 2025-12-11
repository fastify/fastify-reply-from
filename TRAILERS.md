# HTTP Trailers Support Implementation Plan

## Overview

This document outlines the implementation plan for adding HTTP trailers support to @fastify/reply-from. HTTP trailers allow metadata to be sent after the response body, useful for checksums, timing data, and other information only available after processing.

## Current State Analysis

### Existing Architecture
- **No trailer support**: The current codebase has no trailer handling functionality
- **Header-only forwarding**: Only regular HTTP headers are forwarded via `copyHeaders()` and `rewriteHeaders()`
- **Three HTTP clients**: HTTP/1.1 (`http`/`https`), HTTP/2 (`http2`), and undici - each with different trailer APIs
- **Stream-based responses**: Responses are forwarded as streams via `res.stream`

### Key Integration Points
1. **lib/request.js**: HTTP client abstraction layer needs trailer collection
2. **index.js**: Main plugin needs trailer forwarding and API hooks
3. **lib/utils.js**: Utility functions for trailer manipulation
4. **lib/errors.js**: Error handling for trailer-related failures

## Implementation Architecture

### Phase 1: Core Infrastructure

#### 1.1 Trailer Collection in HTTP Clients (`lib/request.js`)

**HTTP/1.1 Implementation**:
```javascript
function handleHttp1Req(opts, done) {
  const req = requests[opts.url.protocol].request(/* ... */);
  
  req.on('response', res => {
    let trailers = {};
    
    // Collect trailers when they arrive
    res.on('end', () => {
      trailers = res.trailers || {};
    });
    
    done(null, { 
      statusCode: res.statusCode, 
      headers: res.headers, 
      stream: res,
      getTrailers: () => trailers  // Async accessor
    });
  });
}
```

**HTTP/2 Implementation**:
```javascript
function handleHttp2Req(opts, done) {
  const req = http2Client.request(/* ... */);
  let trailers = {};
  
  req.on('trailers', (headers) => {
    trailers = headers;
  });
  
  req.on('response', headers => {
    done(null, { 
      statusCode: headers[':status'], 
      headers, 
      stream: req,
      getTrailers: () => trailers
    });
  });
}
```

**Undici Implementation**:
```javascript
function handleUndici(opts, done) {
  pool.request(req, function (err, res) {
    if (err) return done(err);
    
    done(null, { 
      statusCode: res.statusCode, 
      headers: res.headers, 
      stream: res.body,
      getTrailers: () => res.trailers || {}  // Built-in support
    });
  });
}
```

#### 1.2 Trailer Utilities (`lib/utils.js`)

**New utility functions**:
```javascript
// Filter forbidden trailer fields per RFC 7230
function filterForbiddenTrailers(trailers) {
  const forbidden = new Set([
    'transfer-encoding', 'content-length', 'host',
    'cache-control', 'max-forwards', 'te', 'authorization',
    'set-cookie', 'content-encoding', 'content-type', 'content-range'
  ]);
  
  const filtered = {};
  for (const [key, value] of Object.entries(trailers)) {
    if (!forbidden.has(key.toLowerCase()) && !key.startsWith(':')) {
      filtered[key] = value;
    }
  }
  return filtered;
}

// Copy trailers to Fastify reply
function copyTrailers(trailers, reply) {
  const filtered = filterForbiddenTrailers(trailers);
  for (const [key, value] of Object.entries(filtered)) {
    reply.trailer(key, async () => value);
  }
}

// Check if client supports trailers
function clientSupportsTrailers(request) {
  const te = request.headers.te || '';
  return te.includes('trailers');
}
```

### Phase 2: Plugin Integration

#### 2.1 Plugin Options Extension

**New configuration options**:
```javascript
const defaultOptions = {
  // Existing options...
  
  // Trailer-specific options
  forwardTrailers: true,           // Enable/disable trailer forwarding
  stripForbiddenTrailers: true,    // Remove forbidden trailer fields
  requireTrailerSupport: false,    // Only forward if client advertises support
  maxTrailerSize: 8192,           // Limit trailer header size
  trailersTimeout: 5000           // Timeout for trailer collection
};
```

#### 2.2 Request/Response Hook Extensions

**New hook options**:
```javascript
reply.from(source, {
  // Existing options...
  
  // Trailer hooks
  rewriteTrailers: (trailers, request) => {
    // Transform upstream trailers before forwarding
    return { ...trailers, 'x-proxy-timing': Date.now() };
  },
  
  onTrailers: (request, reply, trailers) => {
    // Custom trailer handling
    console.log('Received trailers:', trailers);
  },
  
  addTrailers: {
    'x-proxy-id': 'fastify-reply-from',
    'x-response-time': async (reply, payload) => {
      return `${Date.now() - reply.startTime}ms`;
    }
  }
});
```

#### 2.3 Main Plugin Logic Update (`index.js`)

**Enhanced response handling**:
```javascript
requestImpl({ method, url, qs, headers: requestHeaders, body }, (err, res) => {
  if (err) {
    // Existing error handling...
    return;
  }
  
  // Existing header and status code handling...
  
  if (onResponse) {
    onResponse(this.request, this, res.stream);
  } else {
    this.send(res.stream);
  }
  
  // NEW: Handle trailers after response is sent
  if (opts.forwardTrailers !== false && res.getTrailers && clientSupportsTrailers(this.request)) {
    handleTrailerForwarding(this, res, opts);
  }
});

function handleTrailerForwarding(reply, res, opts) {
  // Set up trailer collection with timeout
  const trailerTimeout = setTimeout(() => {
    reply.request.log.warn('Trailer collection timeout');
  }, opts.trailersTimeout || 5000);
  
  // Wait for response stream to end, then collect trailers
  res.stream.on('end', () => {
    clearTimeout(trailerTimeout);
    
    try {
      const trailers = res.getTrailers();
      if (Object.keys(trailers).length > 0) {
        const rewriteTrailers = opts.rewriteTrailers || ((t) => t);
        const processedTrailers = rewriteTrailers(trailers, reply.request);
        
        if (opts.onTrailers) {
          opts.onTrailers(reply.request, reply, processedTrailers);
        } else {
          copyTrailers(processedTrailers, reply);
        }
      }
      
      // Add custom trailers if specified
      if (opts.addTrailers) {
        addCustomTrailers(reply, opts.addTrailers);
      }
      
    } catch (error) {
      reply.request.log.error(error, 'Error processing trailers');
    }
  });
}
```

### Phase 3: Testing Strategy

#### 3.1 Unit Tests

**Test files to create**:
- `test/trailers-http1.test.js` - HTTP/1.1 trailer forwarding
- `test/trailers-http2.test.js` - HTTP/2 trailer forwarding  
- `test/trailers-undici.test.js` - Undici trailer forwarding
- `test/trailers-hooks.test.js` - Custom trailer hooks
- `test/trailers-errors.test.js` - Error handling scenarios

**Test scenarios**:
```javascript
// Basic trailer forwarding
tap.test('forwards upstream trailers to client', async (t) => {
  const upstream = createUpstreamWithTrailers();
  const proxy = createProxy({ forwardTrailers: true });
  
  const response = await proxy.inject('/test');
  t.equal(response.trailers['x-custom'], 'value');
});

// Forbidden trailer filtering
tap.test('strips forbidden trailer fields', async (t) => {
  const upstream = createUpstreamWithForbiddenTrailers();
  const proxy = createProxy({ stripForbiddenTrailers: true });
  
  const response = await proxy.inject('/test');
  t.notOk(response.trailers['content-length']);
  t.ok(response.trailers['x-allowed']);
});

// Client capability detection
tap.test('only sends trailers when client supports them', async (t) => {
  const upstream = createUpstreamWithTrailers();
  const proxy = createProxy({ requireTrailerSupport: true });
  
  // Without TE: trailers header
  let response = await proxy.inject('/test');
  t.notOk(response.trailers);
  
  // With TE: trailers header
  response = await proxy.inject({
    url: '/test',
    headers: { 'TE': 'trailers' }
  });
  t.ok(response.trailers);
});
```

#### 3.2 Integration Tests

**Real-world scenarios**:
- Content integrity verification with MD5 trailers
- Performance timing data collection
- Custom metadata forwarding
- Error handling with malformed trailers

### Phase 4: Documentation

#### 4.1 README Updates

**New sections to add**:

```markdown
### Trailer Support

@fastify/reply-from supports HTTP trailers for forwarding metadata that's only available after processing the response body.

#### Basic Usage

```javascript
// Enable trailer forwarding
proxy.register(require('@fastify/reply-from'), {
  base: 'http://localhost:3001/',
  forwardTrailers: true
});

proxy.get('/', (request, reply) => {
  reply.from('/');
});
```

#### Advanced Configuration

```javascript
proxy.get('/', (request, reply) => {
  reply.from('/', {
    rewriteTrailers: (trailers, request) => {
      // Add proxy timing information
      return {
        ...trailers,
        'x-proxy-time': Date.now() - request.startTime
      };
    },
    
    addTrailers: {
      'x-proxy-version': '1.0.0'
    }
  });
});
```

#### Options

- `forwardTrailers` (boolean): Enable trailer forwarding (default: true)
- `stripForbiddenTrailers` (boolean): Remove RFC-forbidden trailer fields (default: true)
- `requireTrailerSupport` (boolean): Only send trailers if client advertises support (default: false)
- `trailersTimeout` (number): Timeout in ms for trailer collection (default: 5000)
```

#### 4.2 Type Definitions (`types/index.d.ts`)

**TypeScript interface updates**:
```typescript
interface FastifyReplyFromOptions {
  // Existing options...
  
  forwardTrailers?: boolean;
  stripForbiddenTrailers?: boolean;
  requireTrailerSupport?: boolean;
  trailersTimeout?: number;
}

interface ReplyFromOptions {
  // Existing options...
  
  rewriteTrailers?: (trailers: Record<string, string>, request: FastifyRequest) => Record<string, string>;
  onTrailers?: (request: FastifyRequest, reply: FastifyReply, trailers: Record<string, string>) => void;
  addTrailers?: Record<string, string | ((reply: FastifyReply, payload?: any) => Promise<string>)>;
}
```

## Implementation Timeline

### Phase 1: Foundation (Week 1-2)
- [ ] Implement trailer collection in HTTP clients
- [ ] Add trailer utility functions
- [ ] Create basic plugin option parsing

### Phase 2: Integration (Week 3-4)
- [ ] Implement main trailer forwarding logic
- [ ] Add configuration options and hooks
- [ ] Integrate with existing request/response pipeline

### Phase 3: Testing (Week 5-6)
- [ ] Write comprehensive unit tests
- [ ] Add integration tests for all HTTP clients
- [ ] Performance testing with trailer overhead

### Phase 4: Documentation (Week 7)
- [ ] Update README with trailer documentation
- [ ] Add TypeScript definitions
- [ ] Create usage examples and migration guide

## Compatibility Considerations

### Breaking Changes
- **None expected**: All trailer functionality is opt-in via configuration
- **Default behavior**: Trailers disabled by default for backward compatibility

### HTTP Client Support
- **HTTP/1.1**: Full support with chunked encoding requirement
- **HTTP/2**: Native trailer support, no additional requirements
- **Undici**: Built-in trailer collection, most reliable implementation

### Browser Compatibility
- **Modern browsers**: Good trailer support
- **Legacy clients**: May ignore trailers (graceful degradation)
- **CDN/Proxy issues**: Some intermediaries strip trailers

## Security Considerations

### Trailer Filtering
- **Forbidden headers**: Automatically strip security-sensitive trailer fields
- **Size limits**: Implement maximum trailer size to prevent memory exhaustion
- **Timeout protection**: Prevent hanging connections waiting for trailers

### Client Validation
- **TE header checking**: Only send trailers when client advertises support
- **Malformed trailer handling**: Graceful error recovery for invalid trailer data

## Performance Impact

### Memory Usage
- **Trailer buffering**: Minimal overhead for collecting trailer data
- **Stream handling**: No impact on response body streaming performance

### Latency
- **Additional roundtrip**: Trailers sent after response body completion
- **Timeout overhead**: Configurable timeout for trailer collection (default: 5s)

### Benchmarking Plan
- Compare response times with/without trailer forwarding
- Memory usage analysis with large trailer sets
- Throughput impact assessment

This implementation plan provides a comprehensive roadmap for adding HTTP trailers support to @fastify/reply-from while maintaining backward compatibility and following established patterns in the codebase.