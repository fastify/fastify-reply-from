'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.test('rewriteRequestHeaders type', async (t) => {
  t.plan(5)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    res.statusCode = 205
    res.end(req.headers.host)
  })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      rewriteRequestHeaders: (originalReq) => {
        t.assert.ok('rewriteRequestHeaders called with correct request parameter')
        t.assert.strictEqual(originalReq, request)
        return {}
      }
    })
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))

  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)

  t.assert.strictEqual(result.statusCode, 205)
})
