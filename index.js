'use strict'

const fp = require('fastify-plugin')
const URL = require('url').URL
const lru = require('tiny-lru')
const querystring = require('querystring')
const Stream = require('stream')
const buildRequest = require('./lib/request')
const { filterPseudoHeaders, copyHeaders, stripHttp1ConnectionHeaders } = require('./lib/utils')

module.exports = fp(function from (fastify, opts, next) {
  const cache = lru(opts.cacheURLs || 100)
  const base = opts.base
  const { request, close } = buildRequest({
    http2: !!opts.http2,
    base,
    keepAliveMsecs: opts.keepAliveMsecs,
    maxFreeSockets: opts.maxFreeSockets,
    maxSockets: opts.maxSockets,
    rejectUnauthorized: opts.rejectUnauthorized
  })
  fastify.decorateReply('from', function (source, opts) {
    opts = opts || {}
    const req = this.request.req
    const onResponse = opts.onResponse
    const rewriteHeaders = opts.rewriteHeaders || headersNoOp

    if (!source) {
      source = req.url
    }

    // we leverage caching to avoid parsing the destination URL
    const url = cache.get(source) || new URL(source, base)
    cache.set(source, url)

    const sourceHttp2 = req.httpVersionMajor === 2
    var headers = sourceHttp2 ? filterPseudoHeaders(req.headers) : req.headers
    headers.host = url.hostname
    const qs = getQueryString(url.search, req.url, opts)
    var body = ''

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
        body = JSON.stringify(this.request.body)
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
        throw new Error('Rewriting the body when doing a GET is not allowed')
      }
      headers['content-length'] = 0
    }

    req.log.info({ source }, 'fetching from remote server')

    request({ method: req.method, url, qs, headers, body }, (err, res) => {
      if (err) {
        this.request.log.warn(err, 'response errored')
        if (!this.sent) {
          if (err.code === 'ERR_HTTP2_STREAM_CANCEL') {
            this.code(503).send(new Error('Service Unavailable'))
          } else {
            this.send(err)
          }
        }
        return
      }
      this.request.log.info('response received')
      if (sourceHttp2) {
        copyHeaders(rewriteHeaders(stripHttp1ConnectionHeaders(res.headers)), this)
      } else {
        copyHeaders(rewriteHeaders(res.headers), this)
      }
      this.code(res.statusCode)
      if (onResponse) {
        onResponse(res.stream)
      } else {
        this.send(res.stream)
      }
    })
  })

  fastify.onClose((fastify, next) => {
    close()
    // let the event loop do a full run so that it can
    // actually destroy those sockets
    setImmediate(next)
  })

  next()
}, '>= 1.3.0')

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
