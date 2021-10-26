'use strict'
const semver = require('semver')
const http = require('http')
const https = require('https')
const querystring = require('querystring')
const eos = require('end-of-stream')
const pump = require('pump')
const undici = require('undici')
const { stripHttp1ConnectionHeaders } = require('./utils')
const http2 = require('http2')

class TimeoutError extends Error {}

function shouldUseUndici (opts) {
  if (opts.undici === false || opts.http || opts.http2) {
    return false
  }
  return true
}

function isUndiciInstance (obj) {
  return obj instanceof undici.Pool ||
    obj instanceof undici.Client ||
    obj instanceof undici.Dispatcher
}

function buildRequest (opts) {
  const isHttp2 = !!opts.http2
  const hasUndiciOptions = shouldUseUndici(opts)
  const requests = {
    'http:': http,
    'https:': https,
    'unix+http:': { base: http, request: unixRequest },
    'unix+https:': { base: https, request: unixRequest }
  }
  const http2Opts = getHttp2Opts(opts)
  const httpOpts = getHttpOpts(opts)
  const baseUrl = opts.base && new URL(opts.base).origin
  const undiciOpts = opts.undici || {}
  let http2Client
  let undiciAgent
  let undiciInstance
  let agents

  if (isHttp2) {
    if (semver.lt(process.version, '9.0.0')) {
      throw new Error('Http2 support requires Node version >= 9.0.0')
    }
    if (!opts.base) throw new Error('Option base is required when http2 is true')
    if (opts.base.startsWith('unix+')) {
      throw new Error('Unix socket destination is not supported when http2 is true')
    }
  } else {
    agents = httpOpts.agents || {
      'http:': new http.Agent(httpOpts.agentOptions),
      'https:': new https.Agent(httpOpts.agentOptions)
    }
  }

  if (isHttp2) {
    return { request: handleHttp2Req, close, retryOnError: 'ECONNRESET' }
  } else if (hasUndiciOptions) {
    if (opts.base && opts.base.startsWith('unix+')) {
      const undiciOpts = getUndiciOptions(opts.undici)
      undiciOpts.socketPath = decodeURIComponent(new URL(opts.base).host)
      const protocol = opts.base.startsWith('unix+https') ? 'https' : 'http'
      undiciInstance = new undici.Pool(protocol + '://localhost', undiciOpts)
    } else if (isUndiciInstance(opts.undici)) {
      undiciInstance = opts.undici
    } else {
      undiciAgent = new undici.Agent(getUndiciOptions(opts.undici))
    }
    return { request: handleUndici, close, retryOnError: 'UND_ERR_SOCKET' }
  } else {
    return { request: handleHttp1Req, close, retryOnError: 'ECONNRESET' }
  }

  function close () {
    if (hasUndiciOptions) {
      undiciAgent && undiciAgent.destroy()
      undiciInstance && undiciInstance.destroy()
    } else if (!isHttp2) {
      agents['http:'].destroy()
      agents['https:'].destroy()
    } else if (http2Client) {
      http2Client.destroy()
    }
  }

  function handleHttp1Req (opts, done) {
    const req = requests[opts.url.protocol].request({
      method: opts.method,
      port: opts.url.port,
      path: opts.url.pathname + opts.qs,
      hostname: opts.url.hostname,
      headers: opts.headers,
      agent: agents[opts.url.protocol.replace(/^unix:/, '')],
      ...httpOpts.requestOptions
    })
    req.on('error', done)
    req.on('response', res => {
      done(null, { statusCode: res.statusCode, headers: res.headers, stream: res })
    })
    req.once('timeout', () => {
      const err = new TimeoutError('HTTP request timed out')
      req.abort()
      done(err)
    })

    end(req, opts.body, done)
  }

  function handleUndici (opts, done) {
    const req = {
      origin: baseUrl || opts.url.origin,
      path: opts.url.pathname + opts.qs,
      method: opts.method,
      headers: Object.assign({}, opts.headers),
      body: opts.body,
      headersTimeout: undiciOpts.headersTimeout,
      bodyTimeout: undiciOpts.bodyTimeout
    }

    let pool

    if (undiciInstance) {
      pool = undiciInstance
    } else if (!baseUrl && opts.url.protocol.startsWith('unix')) {
      done(new Error('unix socket not supported with undici yet'))
      return
    } else {
      pool = undiciAgent
    }

    // remove forbidden headers
    req.headers.connection = undefined
    req.headers['transfer-encoding'] = undefined

    pool.request(req, function (err, res) {
      if (err) {
        done(err)
        return
      }

      // using delete, otherwise it will render as an empty string
      delete res.headers['transfer-encoding']

      done(null, { statusCode: res.statusCode, headers: res.headers, stream: res.body })
    })
  }

  function handleHttp2Req (opts, done) {
    let cancelRequest
    let sessionTimedOut = false

    if (!http2Client || http2Client.destroyed) {
      http2Client = http2.connect(baseUrl, http2Opts.sessionOptions)
      http2Client.once('error', done)
      // we might enqueue a large number of requests in this connection
      // before it's connected
      http2Client.setMaxListeners(0)
      http2Client.setTimeout(http2Opts.sessionTimeout, function () {
        if (cancelRequest) {
          cancelRequest()
          cancelRequest = undefined
          sessionTimedOut = true
        }
        http2Client.destroy()
      })
      http2Client.once('connect', () => {
        // reset the max listener to 10 on connect
        http2Client.setMaxListeners(10)
        http2Client.removeListener('error', done)
      })
    }
    const req = http2Client.request({
      ':method': opts.method,
      ':path': opts.url.pathname + opts.qs,
      ...stripHttp1ConnectionHeaders(opts.headers)
    }, http2Opts.requestOptions)
    const isGet = opts.method === 'GET' || opts.method === 'get'
    if (!isGet) {
      end(req, opts.body, done)
    }
    req.setTimeout(http2Opts.requestTimeout, () => {
      const err = new TimeoutError('HTTP/2 request timed out')
      req.close(http2.constants.NGHTTP2_CANCEL)
      done(err)
    })
    req.once('close', () => {
      if (sessionTimedOut) {
        const err = new TimeoutError('HTTP/2 session timed out')
        done(err)
      }
    })
    cancelRequest = eos(req, err => {
      if (err) done(err)
    })
    req.on('response', headers => {
      const statusCode = headers[':status']
      done(null, { statusCode, headers, stream: req })
    })
  }
}

module.exports = buildRequest
module.exports.TimeoutError = TimeoutError

function unixRequest (opts) {
  delete opts.port
  opts.socketPath = querystring.unescape(opts.hostname)
  delete opts.hostname
  return this.base.request(opts)
}

function end (req, body, cb) {
  if (!body || typeof body === 'string' || body instanceof Uint8Array) {
    req.end(body)
  } else if (body.pipe) {
    pump(body, req, err => {
      if (err) cb(err)
    })
  } else {
    cb(new Error(`type unsupported for body: ${body.constructor}`))
  }
}

function getHttp2Opts (opts) {
  if (!opts.http2) {
    return {}
  }

  let http2Opts = opts.http2
  if (typeof http2Opts === 'boolean') {
    http2Opts = {}
  }
  http2Opts.sessionOptions = http2Opts.sessionOptions || {}

  if (!http2Opts.sessionTimeout) {
    http2Opts.sessionTimeout = opts.sessionTimeout || 6000
  }
  if (!http2Opts.requestTimeout) {
    http2Opts.requestTimeout = 10000
  }
  http2Opts.sessionOptions.rejectUnauthorized = http2Opts.sessionOptions.rejectUnauthorized || false

  return http2Opts
}

function getHttpOpts (opts) {
  const httpOpts = typeof opts.http === 'object' ? opts.http : {}
  httpOpts.requestOptions = httpOpts.requestOptions || {}

  if (!httpOpts.requestOptions.timeout) {
    httpOpts.requestOptions.timeout = 10000
  }

  httpOpts.requestOptions.rejectUnauthorized = httpOpts.requestOptions.rejectUnauthorized || false

  httpOpts.agentOptions = getAgentOptions(opts)

  return httpOpts
}

function getAgentOptions (opts) {
  return {
    keepAlive: true,
    keepAliveMsecs: 60 * 1000, // 1 minute
    maxSockets: 2048,
    maxFreeSockets: 2048,
    ...(opts.http && opts.http.agentOptions)
  }
}

function getUndiciOptions (opts = {}) {
  const res = {
    pipelining: 1,
    connections: 128,
    tls: {},
    ...(opts)
  }

  res.tls.rejectUnauthorized = res.tls.rejectUnauthorized || false

  return res
}

module.exports.getUndiciOptions = getUndiciOptions
