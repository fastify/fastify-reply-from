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

// Remove host portion (http://, abc://, //foo.com)
const regex = /^((\w+)?:?\/{2,})/

// issue ref: https://github.com/fastify/fast-proxy/issues/42
function buildURL (source, reqBase) {
  // remove the base url if supplied again in the source
  // and sanitize the url
  const cleanSource = reqBase
    ? source.replace(reqBase, '').replace(regex, '/')
    : source

  return new URL(cleanSource, reqBase)
}

module.exports = {
  copyHeaders,
  stripHttp1ConnectionHeaders,
  filterPseudoHeaders,
  buildURL
}
