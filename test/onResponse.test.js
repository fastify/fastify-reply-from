'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.test('onResponse', async (t) => {
  t.plan(6)
  t.teardown(instance.close.bind(instance))

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'GET')
    res.statusCode = 200
    res.end('hello world')
  })

  instance.get('/', (request1, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      onResponse: (request2, reply, res) => {
        t.equal(res.statusCode, 200)
        t.equal(request1.raw, request2.raw)
        reply.send(res.stream)
      }
    })
  })

  t.teardown(target.close.bind(target))

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)
  t.equal(result.statusCode, 200)
  t.equal(await result.body.text(), 'hello world')
})
