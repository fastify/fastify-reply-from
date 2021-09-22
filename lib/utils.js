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
  copyHeaders,
  stripHttp1ConnectionHeaders,
  filterPseudoHeaders,
  buildURL
}
