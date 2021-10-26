'use strict'

const t = require('tap')
const Fastify = require('fastify')
const proxyquire = require('proxyquire')
const http = require('http')
const get = require('simple-get').concat
const undici = require('undici')
const { getUndiciOptions } = require('../lib/request')

t.plan(10)

const instance = Fastify()
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  res.statusCode = 200
  res.end('hello world')
})

instance.get('/', (request, reply) => {
  reply.from()
})

t.teardown(target.close.bind(target))

target.listen(0, err => {
  t.error(err)
  let poolCreation = 0

  const From = proxyquire('..', {
    './lib/request.js': proxyquire('../lib/request.js', {
      undici: proxyquire('undici', {
        './lib/agent': proxyquire('undici/lib/agent.js', {
          './pool': class Pool extends undici.Pool {
            constructor (url, options) {
              super(url, options)
              poolCreation++
            }
          }
        })
      })
    })
  })

  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    undici: buildUndiciOptions()
  })

  instance.listen(0, err => {
    t.error(err)

    get(`http://localhost:${instance.server.address().port}`, (err, res, data) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(data.toString(), 'hello world')
      t.equal(poolCreation, 1)

      get(`http://localhost:${instance.server.address().port}`, (err, res, data) => {
        t.error(err)
        t.equal(res.statusCode, 200)
        t.equal(data.toString(), 'hello world')
        t.equal(poolCreation, 1)
      })
    })
  })
})

function buildUndiciOptions () {
  return getUndiciOptions({
    connections: 42,
    pipelining: 24,
    keepAliveTimeout: 4242,
    strictContentLength: false
  })
}
