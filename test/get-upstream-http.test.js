'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
const instanceWithoutBase = Fastify()
instance.register(From, {
  base: 'http://localhost',
  http: true,
  disableCache: true
})

instanceWithoutBase.register(From, {
  http: true,
  disableCache: true
})

t.test('getUpstream http', async (t) => {
  t.plan(8)
  t.after(() => instance.close())
  t.after(() => instanceWithoutBase.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    res.end(req.headers.host)
  })

  instance.get('/test', (_request, reply) => {
    reply.from('/test', {
      getUpstream: (_req, base) => {
        t.assert.ok('getUpstream called')
        return `${base}:${target.address().port}`
      }
    })
  })

  instanceWithoutBase.get('/test2', (_request, reply) => {
    reply.from('/test2', {
      getUpstream: () => {
        t.assert.ok('getUpstream called')
        return `http://localhost:${target.address().port}`
      }
    })
  })

  t.after(() => target.close())

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => instanceWithoutBase.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}/test`)
  t.assert.strictEqual(result.statusCode, 200)

  const result1 = await request(`http://localhost:${instanceWithoutBase.server.address().port}/test2`)
  t.assert.strictEqual(result1.statusCode, 200)
})
