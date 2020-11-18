'use strict'
const semver = require('semver')
const http = require('http')
const https = require('https')
const querystring = require('querystring')
const eos = require('end-of-stream')
const pump = require('pump')
const undici = require('undici')
const { stripHttp1ConnectionHeaders } = require('./utils')

class TimeoutError extends Error {}

function buildRequest (opts) {
  const isHttp2 = !!opts.http2
  const isUndici = !!opts.undici
  const requests = {
    'http:': http,
    'https:': https,
    'unix+http:': { base: http, request: unixRequest },
    'unix+https:': { base: https, request: unixRequest }
  }
  const baseUrl = opts.base
  const http2Opts = getHttp2Opts(opts)
  const httpOpts = getHttpOpts(opts)
  const undiciOpts = opts.undici
  let http2Client
  let pool
  let agents
  let http2

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
    http2 = getHttp2()
    return { request: handleHttp2Req, close }
  } else if (isUndici) {
    if (opts.base.startsWith('unix+')) {
      throw new Error('Unix socket destination is not supported when undici is enabled')
    }
    if (typeof opts.undici !== 'object') {
      opts.undici = {}
    }
    pool = new undici.Pool(baseUrl, opts.undici)
    return { request: handleUndici, close }
  } else {
    return { request: handleHttp1Req, close }
  }

  function close () {
    if (isUndici) {
      pool.destroy()
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
      path: opts.url.pathname + opts.qs,
      method: opts.method,
      headers: Object.assign({}, opts.headers),
      body: opts.body,
      requestTimeout: undiciOpts.requestTimeout
    }

    // remove forbidden headers
    req.headers.connection = undefined
    req.headers['transfer-encoding'] = undefined

    pool.request(req, function (err, res) {
      if (err) {
        done(err)
        return
      }

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

// neede to avoid the experimental warning
function getHttp2 () {
  return require('http2')
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
  if (!opts.rejectUnauthorized) {
    http2Opts.sessionOptions.rejectUnauthorized = false
  }

  return http2Opts
}

function getHttpOpts (opts) {
  const httpOpts = opts.http || {}
  httpOpts.requestOptions = httpOpts.requestOptions || {}

  if (!httpOpts.requestOptions.timeout) {
    httpOpts.requestOptions.timeout = 10000
  }
  if (!opts.rejectUnauthorized) {
    httpOpts.requestOptions.rejectUnauthorized = false
  }

  httpOpts.agentOptions = getAgentOptions(opts)

  return httpOpts
}

function getAgentOptions (opts) {
  return {
    keepAlive: true,
    keepAliveMsecs: opts.keepAliveMsecs || 60 * 1000, // 1 minute
    maxSockets: opts.maxSockets || 2048,
    maxFreeSockets: opts.maxFreeSockets || 2048,
    ...(opts.http && opts.http.agentOptions)
  }
}
