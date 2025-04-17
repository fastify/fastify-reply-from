'use strict'

const t = require('node:test')
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
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    res.end(req.headers.host)
  })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      getUpstream: (req) => {
        t.assert.ok('getUpstream called with correct request parameter')
        t.assert.strictEqual(req, request)
        return `http://localhost:${target.address().port}`
      }
    })
  })

  t.after(() => target.close())

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)

  t.assert.strictEqual(result.statusCode, 200)
})
