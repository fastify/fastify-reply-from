'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')

test('http -> http2 crash', async (t) => {
  const instance = Fastify()

  t.teardown(instance.close.bind(instance))

  const target = Fastify({
    http2: true
  })

  target.get('/', (_request, reply) => {
    t.pass('request proxied')
    reply.code(200).send({
      hello: 'world'
    })
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.teardown(target.close.bind(target))

  await target.listen({ port: 0 })

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: true
  })

  await instance.listen({ port: 0 })

  await target.close()
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
