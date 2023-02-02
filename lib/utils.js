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

// http required the header to be encoded with latin1
// undici will convert the latin1 buffer back to utf8
// https://github.com/nodejs/undici/blob/2b260c997ad4efe4ed2064b264b4b546a59e7a67/lib/core/util.js#L216-L229
// after chaining, the header will converted in wrong byte
// Buffer.from('', 'latin1').toString('utf8') applied
//
// in order to presist the encoding, always encode it
// back to latin1
function patchUndiciHeaders (headers) {
  const headersKeys = Object.keys(headers)
  const dist = {}

  let header
  let i

  for (i = 0; i < headersKeys.length; i++) {
    header = headersKeys[i]
    if (header.charCodeAt(0) !== 58) { // fast path for indexOf(':') === 0
      dist[header] = Buffer.from(headers[header]).toString('latin1')
    }
  }

  return dist
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
  let baseOrigin = reqBase ? new URL(reqBase).href : undefined
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

module.exports = {
  patchUndiciHeaders,
  copyHeaders,
  stripHttp1ConnectionHeaders,
  filterPseudoHeaders,
  buildURL
}
