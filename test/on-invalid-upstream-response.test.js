'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.plan(7)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  res.statusCode = 888
  res.end('non-standard status code')
})

instance.get('/', (_, reply) => {
  reply.from(`http://localhost:${target.address().port}`, {
    onResponse: (_, _reply, res) => {
      t.equal(res.statusCode, 888)
    }
  })
})

t.teardown(target.close.bind(target))

instance.listen({ port: 0 }, (err) => {
  t.error(err)

  target.listen({ port: 0 }, async (err) => {
    t.error(err)

    const result = await request(`http://localhost:${instance.server.address().port}`)
    t.equal(result.statusCode, 502)
    t.same(await result.body.json(), {
      statusCode: 502,
      code: 'FST_REPLY_FROM_BAD_GATEWAY',
      error: 'Bad Gateway',
      message: 'Bad Gateway'
    })
  })
})
