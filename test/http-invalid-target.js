'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const got = require('got')

test('http invalid target', async (t) => {
  const instance = Fastify()

  t.teardown(instance.close.bind(instance))

  instance.get('/', (request, reply) => {
    reply.from()
  })
  instance.register(From, {
    base: 'http://abc.xyz1'
  })

  await instance.listen(0)

  try {
    await got(`http://localhost:${instance.server.address().port}`)
  } catch (err) {
    t.equal(err.response.statusCode, 503)
    t.match(err.response.headers['content-type'], /application\/json/)
    t.same(JSON.parse(err.response.body), {
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Service Unavailable'
    })
    return
  }
  t.fail()
})
