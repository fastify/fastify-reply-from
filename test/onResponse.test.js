'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.test('onResponse', async (t) => {
  t.plan(6)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    res.statusCode = 200
    res.end('hello world')
  })

  instance.get('/', (request1, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      onResponse: (request2, reply, res) => {
        t.assert.strictEqual(res.statusCode, 200)
        t.assert.strictEqual(request1.raw, request2.raw)
        reply.send(res.stream)
      }
    })
  })

  t.after(() => target.close())

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)
  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(await result.body.text(), 'hello world')
})
