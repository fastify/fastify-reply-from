'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('../..')
const got = require('got')

test('http -> http2', async function (t) {
  const instance = Fastify()

  t.tearDown(instance.close.bind(instance))

  const target = Fastify({
    http2: true
  })

  target.post('/', (request, reply) => {
    t.pass('request proxied')
    t.deepEqual(request.body, { something: 'else' })
    reply.code(200).header('x-my-header', 'hello!').send({
      hello: 'world'
    })
  })

  instance.post('/', (request, reply) => {
    reply.from()
  })

  t.tearDown(target.close.bind(target))

  await target.listen(0)

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: true
  })

  await instance.listen(0)

  const { headers, body, statusCode } = await got(`http://localhost:${instance.server.address().port}`, {
    body: { something: 'else' },
    json: true
  })
  t.equal(statusCode, 200)
  t.equal(headers['x-my-header'], 'hello!')
  t.match(headers['content-type'], /application\/json/)
  t.deepEqual(body, { hello: 'world' })
})
