'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get').concat
const split = require('split2')

const stream = split(JSON.parse)
const instance = Fastify({
  logger: {
    stream
  }
})
instance.register(From, { http: { requestOptions: { timeout: 100 } } })

t.plan(13)
t.tearDown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  setTimeout(() => {
    res.statusCode = 499
    res.setHeader('Content-Type', 'text/plain')
    res.end('HTTP/1.1 499 Client Closed Connection\r\n\r\n')
  }, 1000)
})

instance.get('/', (request, reply) => {
  reply.from(`http://localhost:${target.address().port}`)
})

t.tearDown(target.close.bind(target))

stream.once('data', listenAtLogLine => {
  t.ok(listenAtLogLine, 'listen at log message is ok')
  stream.once('data', incomingRequest => {
    t.ok(incomingRequest, 'incoming request log message is ok')
    stream.once('data', logProxyRequestDefault => {
      t.equal(logProxyRequestDefault.msg, 'fetching from remote server')
      t.equal(new URL(logProxyRequestDefault.source).hostname, 'localhost')
      stream.once('data', logProxyError => {
        t.equal(logProxyError.msg, 'response errored')
        t.notOk(logProxyError.source)
        stream.once('data', (errorLogging) => {
          t.equal(errorLogging.msg, 'Gateway Timeout')
        })
      })
    })
  })
})

instance.listen(0, (err) => {
  t.error(err)

  target.listen(0, (err) => {
    t.error(err)

    get(`http://localhost:${instance.server.address().port}`, (err, res, data) => {
      t.error(err)
      t.equal(res.statusCode, 504)
    })
  })
})
