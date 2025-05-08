'use strict'

const t = require('node:test')
const assert = require('node:assert')
const Fastify = require('fastify')
const { request } = require('undici')
const proxyquire = require('proxyquire')
const http = require('node:http')
const undici = require('undici')
const { getUndiciOptions } = require('../lib/request')

const instance = Fastify()

t.test('undici options', async (t) => {
  t.plan(2)
  t.after(() => instance.close())

  const target = http.createServer((_req, res) => {
    res.statusCode = 200
    res.end('hello world')
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.after(() => target.close())

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const From = proxyquire('..', {
    './lib/request.js': proxyquire('../lib/request.js', {
      undici: undiciProxy
    })
  })

  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    undici: buildUndiciOptions()
  })

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)
  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(await result.body.text(), 'hello world')
})

function undiciProxy () {}
undiciProxy.Agent = class Agent extends undici.Agent {
  constructor (opts) {
    super(opts)
    assert.deepStrictEqual(opts, buildUndiciOptions())
  }
}
undiciProxy.Pool = class Pool extends undici.Pool {
  constructor (url, options) {
    super(url, options)
    assert.deepStrictEqual(options, buildUndiciOptions())
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
