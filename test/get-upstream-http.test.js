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

t.plan(11)
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

instance.listen({ port: 0 }, (err) => {
  t.error(err)
  instanceWithoutBase.listen({ port: 0 }, (err) => {
    t.error(err)
    target.listen({ port: 0 }, async (err) => {
      t.error(err)

      const result = await request(`http://localhost:${instance.server.address().port}/test`)
      t.equal(result.statusCode, 200)

      const result1 = await request(`http://localhost:${instanceWithoutBase.server.address().port}/test2`)
      t.equal(result1.status, 200)
    })
  })
})
