'use strict'
const http = require('node:http')
const https = require('node:https')
const querystring = require('node:querystring')
const eos = require('end-of-stream')
const { pipeline } = require('node:stream')
const undici = require('undici')
const { stripHttp1ConnectionHeaders } = require('./utils')
const http2 = require('node:http2')

const {
  TimeoutError,
  Http2RequestTimeoutError,
  Http2SessionTimeoutError,
  HttpRequestTimeoutError
} = require('./errors')

function shouldUseUndici (opts) {
  if (opts.undici === false || opts.http || opts.http2) {
    return false
  }
  return true
}

function isRequestable (obj) {
  return obj !== null &&
    typeof obj === 'object' &&
    typeof obj.request === 'function'
}

function isUndiciInstance (obj) {
  return obj instanceof undici.Pool ||
    obj instanceof undici.Client ||
    obj instanceof undici.Dispatcher ||
    isRequestable(obj)
}

function buildRequest (opts) {
  const isHttp2 = !!opts.http2
  if (Array.isArray(opts.base) && opts.base.length === 1) {
    opts.base = opts.base[0]
  }
  const hasUndiciOptions = shouldUseUndici(opts)
  const requests = {
    'http:': http,
    'https:': https,
    'unix+http:': { base: http, request: unixRequest },
    'unix+https:': { base: https, request: unixRequest }
  }
  const http2Opts = getHttp2Opts(opts)
  const httpOpts = getHttpOpts(opts)
  const baseUrl = Array.isArray(opts.base) ? null : (opts.base && new URL(opts.base).origin)
  const isBalanced = Array.isArray(opts.base) && opts.base.length > 1
  const undiciOpts = opts.undici || {}
  const globalAgent = opts.globalAgent
  const destroyAgent = opts.destroyAgent
  let http2Client
  let undiciAgent
  let undiciInstance
  let agents

  if (isHttp2) {
    if (!opts.base) return new Error('Option base is required when http2 is true')
    if (opts.base.startsWith('unix+')) {
      return new Error('Unix socket destination is not supported when http2 is true')
    }
  } else if (!globalAgent) {
    agents = httpOpts.agents || {
      'http:': new http.Agent(httpOpts.agentOptions),
      'https:': new https.Agent(httpOpts.agentOptions)
    }
  } else {
    agents = {
      'http:': http.globalAgent,
      'https:': https.globalAgent
    }
  }

  if (isHttp2) {
    return { request: handleHttp2Req, close, retryOnError: 'ECONNRESET' }
  } else if (hasUndiciOptions) {
    if (isBalanced) {
      const origins = opts.base.map(u => new URL(u).origin)
      undiciInstance = new undici.BalancedPool(origins, getUndiciOptions(opts.undici))
    } else if (opts.base?.startsWith('unix+')) {
      const undiciOpts = getUndiciOptions(opts.undici)
      undiciOpts.socketPath = decodeURIComponent(new URL(opts.base).host)
      const protocol = opts.base.startsWith('unix+https') ? 'https' : 'http'
      undiciInstance = new undici.Pool(protocol + '://localhost', undiciOpts)
    } else if (isUndiciInstance(opts.undici)) {
      undiciInstance = opts.undici
    } else if (!globalAgent) {
      if (undiciOpts.proxy) {
        undiciAgent = new undici.ProxyAgent(getUndiciProxyOptions(opts.undici))
      } else {
        undiciAgent = new undici.Agent(getUndiciOptions(opts.undici))
      }
    } else {
      undiciAgent = undici.getGlobalDispatcher()
    }
    return { request: handleUndici, close, retryOnError: 'UND_ERR_SOCKET' }
  } else {
    return { request: handleHttp1Req, close, retryOnError: 'ECONNRESET' }
  }

  function close () {
    if (globalAgent || destroyAgent === false) {
      return
    }

    if (hasUndiciOptions) {
      undiciAgent?.destroy()
      undiciInstance?.destroy()
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
      ...httpOpts.requestOptions,
      timeout: opts.timeout ?? httpOpts.requestOptions.timeout
    })
    req.on('error', done)
    req.on('response', res => {
      // remove timeout for sse connections
      if (res.headers['content-type'] === 'text/event-stream') {
        req.setTimeout(0)
      }
      done(null, { statusCode: res.statusCode, headers: res.headers, stream: res })
    })
    req.once('timeout', () => {
      const err = new HttpRequestTimeoutError()
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
      headersTimeout: opts.timeout ?? undiciOpts.headersTimeout,
      bodyTimeout: opts.timeout ?? undiciOpts.bodyTimeout
    }

    let pool

    if (undiciInstance) {
      pool = undiciInstance
    } else if (pool instanceof undici.BalancedPool) {
      delete req.origin
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
    const isDelete = opts.method === 'DELETE' || opts.method === 'delete'
    if (!isGet && !isDelete) {
      end(req, opts.body, done)
    }
    req.setTimeout(opts.timeout ?? http2Opts.requestTimeout, () => {
      const err = new Http2RequestTimeoutError()
      req.close(http2.constants.NGHTTP2_CANCEL)
      done(err)
    })
    req.once('close', () => {
      if (sessionTimedOut) {
        const err = new Http2SessionTimeoutError()
        done(err)
      }
    })
    cancelRequest = eos(req, err => {
      if (err) done(err)
    })
    req.on('response', headers => {
      // remove timeout for sse connections
      if (headers['content-type'] === 'text/event-stream') {
        req.setTimeout(0)
        http2Client.setTimeout(0)
      }

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
    pipeline(body, req, err => {
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

  if (http2Opts.sessionTimeout === undefined) {
    http2Opts.sessionTimeout = opts.sessionTimeout || 60000
  }
  if (http2Opts.requestTimeout === undefined) {
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
    ...(opts.http?.agentOptions)
  }
}

function getUndiciProxyOptions ({ proxy, ...opts }) {
  if (typeof proxy === 'string' || proxy instanceof URL) {
    return getUndiciOptions({ uri: proxy, ...opts })
  }
  return getUndiciOptions({ ...proxy, ...opts })
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
