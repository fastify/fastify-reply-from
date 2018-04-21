'use strict'
const http = require('http')
const https = require('https')
const http2 = require('http2')
const eos = require('end-of-stream')
const pump = require('pump')
const { stripHttp1ConnectionHeaders } = require('./utils')

class RequestAgent {
  constructor (opts) {
    this.http2 = !!opts.http2
    this.requests = {
      'http:': http,
      'https:': https
    }
    if (this.http2) {
      if (!opts.base) throw new Error('Option base is required when http2 is true')
      this.http2Client = http2.connect(opts.base, { rejectUnauthorized: opts.rejectUnauthorized })
    } else {
      this.agents = {
        'http:': new http.Agent(agentOption(opts)),
        'https:': new https.Agent(agentOption(opts))
      }
    }
  }

  handleHttp1Req ({ method, url, qs, headers, body }, done) {
    const req = this.requests[url.protocol].request({
      method,
      port: url.port,
      path: url.pathname + qs,
      hostname: url.hostname,
      headers,
      agent: this.agents[url.protocol]
    })
    req.on('error', done)
    req.on('response', (res) => {
      done(null, { statusCode: res.statusCode, headers: res.headers, stream: res })
    })
    end(req, body, done)
  }

  handleHttp2Req ({ method, url, qs, headers, body }, done) {
    this.http2Client.ref()
    const isGet = (method === 'GET' || method === 'get')
    const req = this.http2Client.request({
      ':method': method,
      ':path': url.pathname + qs,
      ...stripHttp1ConnectionHeaders(headers)
    })
    if (!isGet) {
      end(req, body, done)
    }
    req.on('error', done)
    eos(req, () => { this.http2Client.unref() })
    req.on('response', headers => {
      const statusCode = headers[':status']
      done(null, { statusCode, headers, stream: req })
    })
  }

  request (opts, done) {
    if (this.http2) {
      this.handleHttp2Req(opts, done)
    } else {
      this.handleHttp1Req(opts, done)
    }
  }

  close () {
    if (!this.http2) {
      this.agents['http:'].destroy()
      this.agents['https:'].destroy()
    } else {
      this.http2Client.destroy()
    }
  }
}

module.exports = RequestAgent

function agentOption (opts) {
  return {
    keepAlive: true,
    keepAliveMsecs: opts.keepAliveMsecs || 60 * 1000, // 1 minute
    maxSockets: opts.maxSockets || 2048,
    maxFreeSockets: opts.maxFreeSockets || 2048,
    rejectUnauthorized: opts.rejectUnauthorized
  }
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
