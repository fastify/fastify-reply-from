'use strict'

const t = require('tap')
const Fastify = require('fastify')
const proxyquire = require('proxyquire')
const http = require('node:http')
const undici = require('undici')
const { getUndiciOptions } = require('../lib/request')

const instance = Fastify()

t.plan(5)
t.teardown(instance.close.bind(instance))

const target = http.createServer((_req, res) => {
  res.statusCode = 200
  res.end('hello world')
})

instance.get('/', (_request, reply) => {
  reply.from()
})

t.teardown(target.close.bind(target))

target.listen({ port: 0 }, err => {
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

  instance.listen({ port: 0 }, async err => {
    t.error(err)

    const result = await fetch(`http://localhost:${instance.server.address().port}`)
    t.equal(result.status, 200)
    t.equal(await result.text(), 'hello world')
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
