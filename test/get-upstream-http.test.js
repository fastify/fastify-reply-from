'use strict'

const t = require('tap')
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
  t.teardown(instance.close.bind(instance))
  t.teardown(instanceWithoutBase.close.bind(instanceWithoutBase))

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'GET')
    res.end(req.headers.host)
  })

  instance.get('/test', (_request, reply) => {
    reply.from('/test', {
      getUpstream: (_req, base) => {
        t.pass('getUpstream called')
        return `${base}:${target.address().port}`
      }
    })
  })

  instanceWithoutBase.get('/test2', (_request, reply) => {
    reply.from('/test2', {
      getUpstream: () => {
        t.pass('getUpstream called')
        return `http://localhost:${target.address().port}`
      }
    })
  })

  t.teardown(target.close.bind(target))

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => instanceWithoutBase.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}/test`)
  t.equal(result.statusCode, 200)

  const result1 = await request(`http://localhost:${instanceWithoutBase.server.address().port}/test2`)
  t.equal(result1.statusCode, 200)
})
