'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From, {
  disableCache: true
})

t.test('getUpstream undici', async (t) => {
  t.plan(4)
  t.teardown(instance.close.bind(instance))

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'GET')
    res.end(req.headers.host)
  })

  instance.get('/test', (_request, reply) => {
    reply.from('/test', {
      getUpstream: () => {
        t.pass('getUpstream called')
        return `http://localhost:${target.address().port}`
      }
    })
  })

  t.teardown(target.close.bind(target))

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}/test`)

  t.equal(result.statusCode, 200)
})
