'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')

test('http2 invalid target', async (t) => {
  const instance = Fastify()

  t.teardown(instance.close.bind(instance))

  instance.get('/', (_request, reply) => {
    reply.from()
  })
  instance.register(From, {
    base: 'http://abc.xyz1',
    http2: true
  })

  await instance.listen({ port: 0 })

  const result = await request(`http://localhost:${instance.server.address().port}`)

  t.equal(result.statusCode, 503)
  t.match(result.headers['content-type'], /application\/json/)
  t.same(await result.body.json(), {
    statusCode: 503,
    code: 'FST_REPLY_FROM_SERVICE_UNAVAILABLE',
    error: 'Service Unavailable',
    message: 'Service Unavailable'
  })
})
