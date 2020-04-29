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

t.plan(10)
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
  reply.from(`http://localhost:${target.address().port}`, {
    logProxyRequest: false,
    logProxyResponse: false
  })
})

t.tearDown(target.close.bind(target))

stream.once('data', listenAtLogLine => {
  t.ok(listenAtLogLine, 'listen at log message is ok')
  stream.once('data', incomingRequest => {
    t.ok(incomingRequest, 'incoming request log message is ok')
    stream.once('data', (outgoingResponse) => {
      t.equal(outgoingResponse.msg, 'request completed')
      stream.once('data', () => {
        t.fail('no proxy logging should not output')
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
