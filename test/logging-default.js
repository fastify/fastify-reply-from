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
instance.register(From)

t.plan(14)
t.tearDown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  res.statusCode = 205
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('x-my-header', 'hello!')
  res.end('hello world')
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
      stream.once('data', logProxyResponseDefault => {
        t.equal(logProxyResponseDefault.msg, 'response received')
        t.notOk(logProxyResponseDefault.source)
        stream.once('data', (outgoingResponse) => {
          t.equal(outgoingResponse.msg, 'request completed')
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
      t.equal(res.headers['content-type'], 'text/plain')
      t.equal(res.statusCode, 205)
    })
  })
})
