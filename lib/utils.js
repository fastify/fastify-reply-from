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

function hasControlCharacter (value) {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) <= 31) return true
  }
  return false
}

function hasDotSegment (decodedPath) {
  const segments = decodedPath.replaceAll('\\', '/').split('/')
  // Strip matrix parameters (`;...`) from each segment before the check.
  // Java-based servers (Tomcat, Jetty, WildFly, Spring Boot) treat `;` as a
  // path-parameter delimiter and remove it during normalization, so a segment
  // like `..;jsessionid=x` is effectively `..` upstream (GHSA-6mph-mjg3-f943).
  // `some()` short-circuits on the first match and only pays to split on `;`
  // when one is present, so the common (safe) case stays allocation-free.
  return segments.some((segment) => {
    const base = segment.includes(';') ? segment.split(';')[0] : segment
    return base === '.' || base === '..'
  })
}

function invalidSourceError () {
  const err = new Error('source/request contain invalid characters')
  err.statusCode = 400
  return err
}

// issue ref: https://github.com/fastify/fast-proxy/issues/42
function buildURL (source, reqBase) {
  // Validate the path before the URL parser can reinterpret it. Special URLs
  // treat backslashes as separators, remove some control characters, and
  // resolve dot segments.
  const queryIndex = source.indexOf('?')
  const fragmentIndex = source.indexOf('#')
  let pathEnd = source.length
  if (queryIndex !== -1) pathEnd = queryIndex
  if (fragmentIndex !== -1 && fragmentIndex < pathEnd) pathEnd = fragmentIndex

  const sourcePath = source.slice(0, pathEnd)
  // Malformed percent-encoding (e.g. `%zz` or a truncated UTF-8 sequence) is a
  // client error. Without this, the URIError reaches the error handler as a
  // 500. If the whole source decodes, the path before `?`/`#` decodes too.
  try {
    decodeURIComponent(source)
  } catch (cause) {
    const err = new Error('source/request contain invalid characters', { cause })
    err.statusCode = 400
    throw err
  }
  const decodedPath = decodeURIComponent(sourcePath)

  if (
    hasControlCharacter(source) ||
    hasControlCharacter(decodedPath) ||
    decodedPath.includes('\\') ||
    source.startsWith(' ') ||
    (pathEnd === source.length && source.endsWith(' ')) ||
    hasDotSegment(decodedPath)
  ) {
    throw invalidSourceError()
  }

  if (Array.isArray(reqBase)) reqBase = reqBase[0]
  let baseOrigin = reqBase ? new URL(reqBase).href : undefined

  // To make sure we don't accidentally override the base path
  if (baseOrigin && source.length > 1 && source[0] === '/' && source[1] === '/') {
    source = '.' + source
  }

  const dest = new URL(source, reqBase)

  // The checks above run on the raw source, but the URL parser may not keep
  // all of it in the path: a source with the same special scheme as the base
  // (e.g. `http:%2e%2e%2fx`) is resolved as a relative path with the scheme
  // dropped, so `http:..` was checked while `%2e%2e%2fx` is forwarded.
  // Re-check the path that will actually be sent upstream, since many
  // upstreams percent-decode it before resolving dot segments.
  if (hasDotSegment(decodeURIComponent(dest.pathname))) {
    throw invalidSourceError()
  }

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

module.exports = {
  copyHeaders,
  stripHttp1ConnectionHeaders,
  getConnectionHeaders,
  filterPseudoHeaders,
  buildURL
}
