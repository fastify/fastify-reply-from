'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')

test('http -> http2', async (t) => {
  const instance = Fastify()

  t.after(() => instance.close())

  const target = Fastify({
    http2: true
  })

  target.get('/', (_request, reply) => {
    t.assert.ok('request proxied')
    reply.code(404).header('x-my-header', 'hello!').send({
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

  const result = await request(`http://localhost:${instance.server.address().port}`, { dispatcher: new Agent({ pipelining: 0 }) })

  t.assert.strictEqual(result.statusCode, 404)
  t.assert.strictEqual(result.headers['x-my-header'], 'hello!')
  t.assert.match(result.headers['content-type'], /application\/json/)
  t.assert.deepStrictEqual(await result.body.json(), { hello: 'world' })
  instance.close()
  target.close()
})
