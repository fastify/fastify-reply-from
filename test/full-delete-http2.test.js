'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')

test('http -> http2', async function (t) {
  const instance = Fastify()

  t.after(() => instance.close())

  const target = Fastify({
    http2: true
  })

  target.delete('/', (_request, reply) => {
    t.assert.ok('request proxied')
    reply.code(200).header('x-my-header', 'hello!').send({
      hello: 'world'
    })
  })

  instance.delete('/', (_request, reply) => {
    reply.from()
  })

  t.after(() => target.close())

  await target.listen({ port: 0 })

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: true
  })

  await instance.listen({ port: 0 })

  const { headers, body, statusCode } = await request(
    `http://localhost:${instance.server.address().port}`,
    {
      method: 'DELETE',
      responseType: 'json',
      dispatcher: new Agent({ pipelining: 0 })
    }
  )
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(headers['x-my-header'], 'hello!')
  t.assert.match(headers['content-type'], /application\/json/)
  t.assert.deepStrictEqual(await body.json(), { hello: 'world' })
  instance.close()
  target.close()
})
