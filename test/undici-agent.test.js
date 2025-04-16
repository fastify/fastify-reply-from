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

  t.assert.deepEqual(result.statusCode, 200)
  t.assert.deepEqual(await result.body.text(), 'hello world')
  t.assert.deepEqual(poolCreation, 1)

  const result2 = await undici.request(`http://localhost:${instance.server.address().port}`)

  t.assert.deepEqual(result2.statusCode, 200)
  t.assert.deepEqual(await result2.body.text(), 'hello world')
  t.assert.deepEqual(poolCreation, 1)
})

function buildUndiciOptions () {
  return getUndiciOptions({
    connections: 42,
    pipelining: 24,
    keepAliveTimeout: 4242,
    strictContentLength: false
  })
}
