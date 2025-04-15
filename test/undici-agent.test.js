'use strict'

const t = require('tap')
const Fastify = require('fastify')
const undici = require('undici')
const proxyquire = require('proxyquire')
const http = require('node:http')
const { getUndiciOptions } = require('../lib/request')

t.test('undici agent', async (t) => {
  t.plan(6)

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  const target = http.createServer((_req, res) => {
    res.statusCode = 200
    res.end('hello world')
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.teardown(target.close.bind(target))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  let poolCreation = 0

  const From = proxyquire('..', {
    './lib/request.js': proxyquire('../lib/request.js', {
      undici: proxyquire('undici', {
        './lib/dispatcher/agent': proxyquire('undici/lib/dispatcher/agent.js', {
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

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await undici.request(`http://localhost:${instance.server.address().port}`)

  t.equal(result.statusCode, 200)
  t.equal(await result.body.text(), 'hello world')
  t.equal(poolCreation, 1)

  const result2 = await undici.request(`http://localhost:${instance.server.address().port}`)

  t.equal(result2.statusCode, 200)
  t.equal(await result2.body.text(), 'hello world')
  t.equal(poolCreation, 1)
})

function buildUndiciOptions () {
  return getUndiciOptions({
    connections: 42,
    pipelining: 24,
    keepAliveTimeout: 4242,
    strictContentLength: false
  })
}
