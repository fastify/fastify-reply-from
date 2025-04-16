'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.test('on-invalid-upstream-response', async (t) => {
  t.plan(5)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.deepEqual(req.method, 'GET')
    res.statusCode = 888
    res.end('non-standard status code')
  })

  instance.get('/', (_, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      onResponse: (_, _reply, res) => {
        t.assert.deepEqual(res.statusCode, 888)
      }
    })
  })

  t.after(() => target.close())

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)
  t.assert.deepEqual(result.statusCode, 502)
  t.same(await result.body.json(), {
    statusCode: 502,
    code: 'FST_REPLY_FROM_BAD_GATEWAY',
    error: 'Bad Gateway',
    message: 'Bad Gateway'
  })
})
