'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')

test('http -> http2 crash', async (t) => {
  const instance = Fastify()

  t.after(() => instance.close())

  const target = Fastify({
    http2: true
  })

  target.get('/', (_request, reply) => {
    t.assert.ok('request proxied')
    reply.code(200).send({
      hello: 'world'
    })
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.after(() => target.close())

  await target.listen({ port: 0 })

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: true
  })

  await instance.listen({ port: 0 })

  await target.close()
  const result = await request(`http://localhost:${instance.server.address().port}`)

  t.assert.strictEqual(result.statusCode, 503)
  t.assert.match(result.headers['content-type'], /application\/json/)
  t.assert.deepStrictEqual(await result.body.json(), {
    statusCode: 503,
    code: 'FST_REPLY_FROM_SERVICE_UNAVAILABLE',
    error: 'Service Unavailable',
    message: 'Service Unavailable'
  })
})
