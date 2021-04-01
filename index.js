'use strict'

const fp = require('fastify-plugin')
const lru = require('tiny-lru')
const querystring = require('querystring')
const Stream = require('stream')
const createError = require('http-errors')
const buildRequest = require('./lib/request')
const {
  filterPseudoHeaders,
  copyHeaders,
  stripHttp1ConnectionHeaders,
  buildURL
} = require('./lib/utils')

const { TimeoutError } = buildRequest

module.exports = fp(function from (fastify, opts, next) {
  const contentTypesToEncode = new Set([
    'application/json',
    ...(opts.contentTypesToEncode || [])
  ])
  const cache = opts.disableCache ? undefined : lru(opts.cacheURLs || 100)
  const base = opts.base
  const { request, close } = buildRequest({
    http: opts.http,
    http2: opts.http2,
    base,
    undici: opts.undici
  })
  fastify.decorateReply('from', function (source, opts) {
    opts = opts || {}
    const req = this.request.raw
    const onResponse = opts.onResponse
    const rewriteHeaders = opts.rewriteHeaders || headersNoOp
    const rewriteRequestHeaders = opts.rewriteRequestHeaders || requestHeadersNoOp
    const getUpstream = opts.getUpstream || upstreamNoOp
    const onError = opts.onError || onErrorDefault

    if (!source) {
      source = req.url
    }

    // we leverage caching to avoid parsing the destination URL
    const dest = getUpstream(req, base)
    let url
    if (cache) {
      url = cache.get(source) || buildURL(source, dest)
      cache.set(source, url)
    } else {
      url = buildURL(source, dest)
    }

    const sourceHttp2 = req.httpVersionMajor === 2
    const headers = sourceHttp2 ? filterPseudoHeaders(req.headers) : req.headers
    headers.host = url.host
    const qs = getQueryString(url.search, req.url, opts)
    let body = ''

    if (opts.body) {
      if (typeof opts.body.pipe === 'function') {
        throw new Error('sending a new body as a stream is not supported yet')
      }

      if (opts.contentType) {
        body = opts.body
      } else {
        body = JSON.stringify(opts.body)
        opts.contentType = 'application/json'
      }

      headers['content-length'] = Buffer.byteLength(body)
      headers['content-type'] = opts.contentType
    } else if (this.request.body) {
      if (this.request.body instanceof Stream) {
        body = this.request.body
      } else {
        // Per RFC 7231 §3.1.1.5 if this header is not present we MAY assume application/octet-stream
        const contentType = req.headers['content-type'] || 'application/octet-stream'
        // detect if body should be encoded as JSON
        // supporting extended content-type header formats:
        // - https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type
        const lowerCaseContentType = contentType.toLowerCase()
        const plainContentType = lowerCaseContentType.indexOf(';') > -1
          ? lowerCaseContentType.slice(0, lowerCaseContentType.indexOf(';'))
          : lowerCaseContentType
        const shouldEncodeJSON = contentTypesToEncode.has(plainContentType)
        // transparently support JSON encoding
        body = shouldEncodeJSON ? JSON.stringify(this.request.body) : this.request.body
        // update origin request headers after encoding
        headers['content-length'] = Buffer.byteLength(body)
        headers['content-type'] = contentType
      }
    }

    // according to https://tools.ietf.org/html/rfc2616#section-4.3
    // fastify ignore message body when it's a GET or HEAD request
    // when proxy this request, we should reset the content-length to make it a valid http request
    // discussion: https://github.com/fastify/fastify/issues/953
    if (req.method === 'GET' || req.method === 'HEAD') {
      // body will be populated here only if opts.body is passed.
      // if we are doing that with a GET or HEAD request is a programmer error
      // and as such we can throw immediately.
      if (body) {
        throw new Error(`Rewriting the body when doing a ${req.method} is not allowed`)
      }
    }

    this.request.log.info({ source }, 'fetching from remote server')

    const requestHeaders = rewriteRequestHeaders(req, headers)

    request({ method: req.method, url, qs, headers: requestHeaders, body }, (err, res) => {
      if (err) {
        this.request.log.warn(err, 'response errored')
        if (!this.sent) {
          if (err.code === 'ERR_HTTP2_STREAM_CANCEL' || err.code === 'ENOTFOUND') {
            onError(this, { error: new createError.ServiceUnavailable() })
          } else if (err instanceof TimeoutError || err.code === 'UND_ERR_HEADERS_TIMEOUT') {
            onError(this, { error: new createError.GatewayTimeout() })
          } else {
            onError(this, { error: createError(500, err) })
          }
        }
        return
      }
      this.request.log.info('response received')
      if (sourceHttp2) {
        copyHeaders(
          rewriteHeaders(stripHttp1ConnectionHeaders(res.headers)),
          this
        )
      } else {
        copyHeaders(rewriteHeaders(res.headers), this)
      }
      this.code(res.statusCode)
      if (onResponse) {
        onResponse(this.request.raw, this, res.stream)
      } else {
        this.send(res.stream)
      }
    })
    return this
  })

  fastify.addHook('onReady', (done) => {
    if (isFastifyMultipartRegistered(fastify)) {
      fastify.log.warn('fastify-reply-from might not behave as expected when used with fastify-multipart')
    }
    done()
  })

  fastify.onClose((fastify, next) => {
    close()
    // let the event loop do a full run so that it can
    // actually destroy those sockets
    setImmediate(next)
  })

  next()
}, '>=3')

function getQueryString (search, reqUrl, opts) {
  if (opts.queryString) {
    return '?' + querystring.stringify(opts.queryString)
  }

  if (search.length > 0) {
    return search
  }

  const queryIndex = reqUrl.indexOf('?')

  if (queryIndex > 0) {
    return reqUrl.slice(queryIndex)
  }

  return ''
}

function headersNoOp (headers) {
  return headers
}

function requestHeadersNoOp (originalReq, headers) {
  return headers
}

function upstreamNoOp (req, base) {
  return base
}

function onErrorDefault (reply, { error }) {
  reply.send(error)
}

function isFastifyMultipartRegistered (fastify) {
  return fastify.hasContentTypeParser('multipart') && fastify.hasRequestDecorator('multipart')
}
