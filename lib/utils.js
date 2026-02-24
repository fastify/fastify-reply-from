'use strict'

function filterPseudoHeaders (headers) {
  const dest = {}
  const headersKeys = Object.keys(headers)
  let header
  let i
  for (i = 0; i < headersKeys.length; i++) {
    header = headersKeys[i]
    if (header.charCodeAt(0) !== 58) { // fast path for indexOf(':') === 0
      dest[header.toLowerCase()] = headers[header]
    }
  }
  return dest
}

function copyHeaders (headers, reply) {
  const headersKeys = Object.keys(headers)

  let header
  let i

  for (i = 0; i < headersKeys.length; i++) {
    header = headersKeys[i]
    if (header.charCodeAt(0) !== 58) { // fast path for indexOf(':') === 0
      reply.header(header, headers[header])
    }
  }
}

// Parse Connection header and return list of header names to strip (per RFC 7230 Section 6.1)
function getConnectionHeaders (headers) {
  const connectionHeader = headers.connection
  if (typeof connectionHeader !== 'string') {
    return []
  }
  // Connection header is comma-separated list of header names
  const lowerCased = connectionHeader.toLowerCase()
  const result = []
  let start = 0
  let end = 0
  for (; end <= lowerCased.length; end++) {
    if (lowerCased.charCodeAt(end) === 44 || end === lowerCased.length) { // 44 = ','
      const token = lowerCased.slice(start, end).trim()
      if (token.length > 0) {
        result.push(token)
      }
      start = end + 1
    }
  }
  return result
}

function stripHttp1ConnectionHeaders (headers) {
  const headersKeys = Object.keys(headers)
  const dest = {}

  // Get headers listed in Connection header that should be stripped (RFC 7230 Section 6.1)
  const connectionHeaderNames = getConnectionHeaders(headers)

  let header
  let i

  for (i = 0; i < headersKeys.length; i++) {
    header = headersKeys[i].toLowerCase()

    switch (header) {
      case 'connection':
      case 'upgrade':
      case 'http2-settings':
      case 'transfer-encoding':
      case 'proxy-connection':
      case 'keep-alive':
      case 'host':
        break
      case 'te':
        // see illegal connection specific header handling in Node.js
        if (headers['te'] === 'trailers') {
          dest[header] = headers[header]
        }
        break
      default:
        // Also skip headers listed in Connection header (RFC 7230 Section 6.1)
        if (!connectionHeaderNames.includes(header)) {
          dest[header] = headers[header]
        }
        break
    }
  }
  return dest
}

// issue ref: https://github.com/fastify/fast-proxy/issues/42
function buildURL (source, reqBase) {
  if (decodeURIComponent(source).includes('..')) {
    const err = new Error('source/request contain invalid characters')
    err.statusCode = 400
    throw err
  }

  if (Array.isArray(reqBase)) reqBase = reqBase[0]
  let baseOrigin = reqBase ? new URL(reqBase).href : undefined

  // To make sure we don't accidentally override the base path
  if (baseOrigin && source.length > 1 && source[0] === '/' && source[1] === '/') {
    source = '.' + source
  }

  const dest = new URL(source, reqBase)

  // if base is specified, source url should not override it
  if (baseOrigin) {
    if (!baseOrigin.endsWith('/') && dest.href.length > baseOrigin.length) {
      baseOrigin = baseOrigin + '/'
    }

    if (!dest.href.startsWith(baseOrigin)) {
      throw new Error('source must be a relative path string')
    }
  }

  return dest
}

// Filter forbidden trailer fields per RFC 7230/9110
function filterForbiddenTrailers (trailers) {
  const forbidden = new Set([
    'transfer-encoding', 'content-length', 'host',
    'cache-control', 'max-forwards', 'te', 'authorization',
    'set-cookie', 'content-encoding', 'content-type', 'content-range',
    'trailer'
  ])

  const filtered = {}
  const trailerKeys = Object.keys(trailers)

  for (let i = 0; i < trailerKeys.length; i++) {
    const key = trailerKeys[i]
    const lowerKey = key.toLowerCase()

    // Skip forbidden headers and HTTP/2 pseudo-headers
    if (!forbidden.has(lowerKey) && key.charCodeAt(0) !== 58) {
      filtered[key] = trailers[key]
    }
  }

  return filtered
}

// Copy trailers to Fastify reply using the trailer API
function copyTrailers (trailers, reply) {
  const filtered = filterForbiddenTrailers(trailers)
  const trailerKeys = Object.keys(filtered)

  for (let i = 0; i < trailerKeys.length; i++) {
    const key = trailerKeys[i]
    const value = filtered[key]

    // Use Fastify's trailer API with async function
    reply.trailer(key, async () => value)
  }
}

// Check if client supports trailers via TE header
function clientSupportsTrailers (request) {
  const te = request.headers.te || ''
  return te.includes('trailers')
}

module.exports = {
  copyHeaders,
  stripHttp1ConnectionHeaders,
  getConnectionHeaders,
  filterPseudoHeaders,
  buildURL,
  filterForbiddenTrailers,
  copyTrailers,
  clientSupportsTrailers
}
