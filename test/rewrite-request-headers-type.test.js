'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.test('rewriteRequestHeaders type', async (t) => {
  t.plan(5)
  t.teardown(instance.close.bind(instance))

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'GET')
    res.statusCode = 205
    res.end(req.headers.host)
  })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      rewriteRequestHeaders: (originalReq) => {
        t.pass('rewriteRequestHeaders called with correct request parameter')
        t.equal(originalReq, request)
        return {}
      }
    })
  })

  t.teardown(target.close.bind(target))

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))

  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)

  t.equal(result.statusCode, 205)
})
