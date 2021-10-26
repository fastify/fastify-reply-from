'use strict'

const t = require('tap')
const Fastify = require('fastify')
const proxyquire = require('proxyquire')
const http = require('http')
const get = require('simple-get').concat
const undici = require('undici')
const { getUndiciOptions } = require('../lib/request')

const instance = Fastify()

t.plan(6)
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

  const From = proxyquire('..', {
    './lib/request.js': proxyquire('../lib/request.js', {
      undici: undiciProxy
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
    })
  })
})

function undiciProxy () {}
undiciProxy.Agent = class Agent extends undici.Agent {
  constructor (opts) {
    super(opts)
    t.strictSame(opts, buildUndiciOptions())
  }
}
undiciProxy.Pool = class Pool extends undici.Pool {
  constructor (url, options) {
    super(url, options)
    t.hasStrict(options, buildUndiciOptions())
  }
}

function buildUndiciOptions () {
  return getUndiciOptions({
    connections: 42,
    pipelining: 24,
    keepAliveTimeout: 4242,
    strictContentLength: false
  })
}
