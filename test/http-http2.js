'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const got = require('got')

test('http -> http2', async (t) => {
  const instance = Fastify()

  t.teardown(instance.close.bind(instance))

  const target = Fastify({
    http2: true
  })

  target.get('/', (request, reply) => {
    t.pass('request proxied')
    reply.code(404).header('x-my-header', 'hello!').send({
      hello: 'world'
    })
  })

  instance.get('/', (request, reply) => {
    reply.from()
  })

  t.teardown(target.close.bind(target))

  await target.listen(0)

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: true
  })

  await instance.listen(0)

  try {
    await got(`http://localhost:${instance.server.address().port}`)
  } catch (err) {
    t.equal(err.response.statusCode, 404)
    t.equal(err.response.headers['x-my-header'], 'hello!')
    t.match(err.response.headers['content-type'], /application\/json/)
    t.same(JSON.parse(err.response.body), { hello: 'world' })
    return
  }

  t.fail()
})
