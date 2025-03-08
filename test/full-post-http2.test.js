'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const { request } = require('undici')

test('http -> http2', async function (t) {
  const instance = Fastify()

  t.teardown(instance.close.bind(instance))

  const target = Fastify({
    http2: true
  })

  target.post('/', (request, reply) => {
    t.pass('request proxied')
    t.same(request.body, { something: 'else' })
    reply.code(200).header('x-my-header', 'hello!').send({
      hello: 'world'
    })
  })

  instance.post('/', (_request, reply) => {
    reply.from()
  })

  t.teardown(target.close.bind(target))

  await target.listen({ port: 0 })

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: true
  })

  await instance.listen({ port: 0 })

  const { headers, body, statusCode } = await request(`http://localhost:${instance.server.address().port}`, {
    method: 'POST',
    body: JSON.stringify({ something: 'else' }),
    headers: {
      'content-type': 'application/json'
    }
  })
  t.equal(statusCode, 200)
  t.equal(headers['x-my-header'], 'hello!')
  t.match(headers['content-type'], /application\/json/)
  t.same(await body.json(), { hello: 'world' })
})
