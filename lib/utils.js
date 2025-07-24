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

function stripHttp1ConnectionHeaders (headers) {
  const headersKeys = Object.keys(headers)
  const dest = {}

  let header
  let i

  for (i = 0; i < headersKeys.length; i++) {
    header = headersKeys[i].toLowerCase()

    switch (header) {
      case 'connection':
      case 'upgrade':
      case 'http2-settings':
      case 'te':
      case 'transfer-encoding':
      case 'proxy-connection':
      case 'keep-alive':
      case 'host':
        break
      default:
        dest[header] = headers[header]
        break
    }
  }
  return dest
}

// issue ref: https://github.com/fastify/fast-proxy/issues/42
function buildURL (source, reqBase) {
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
  filterPseudoHeaders,
  buildURL,
  filterForbiddenTrailers,
  copyTrailers,
  clientSupportsTrailers
}
