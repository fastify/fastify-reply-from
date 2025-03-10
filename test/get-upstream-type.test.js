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

t.test('getUpstream type', async (t) => {
  t.plan(5)
  t.teardown(instance.close.bind(instance))

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'GET')
    res.end(req.headers.host)
  })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      getUpstream: (req) => {
        t.pass('getUpstream called with correct request parameter')
        t.equal(req, request)
        return `http://localhost:${target.address().port}`
      }
    })
  })

  t.teardown(target.close.bind(target))

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)

  t.equal(result.statusCode, 200)
})
