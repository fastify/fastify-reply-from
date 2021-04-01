'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const got = require('got')
const proxyquire = require('proxyquire')

// Stub request to throw error 'foo'
const From = proxyquire('..', {
  './lib/request': function () {
    return {
      request: (opts, callback) => { callback(new Error('foo')) },
      close: () => {}
    }
  }
})

test('unexpected error renders 500', async (t) => {
  const instance = Fastify()

  t.teardown(instance.close.bind(instance))

  instance.get('/', (request, reply) => {
    reply.code(201)
    reply.from()
  })
  instance.register(From, {
    base: 'http://localhost'
  })

  await instance.listen(0)

  try {
    await got(`http://localhost:${instance.server.address().port}`)
  } catch (err) {
    t.equal(err.response.statusCode, 500)
    t.match(err.response.headers['content-type'], /application\/json/)
    t.same(JSON.parse(err.response.body), {
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'foo'
    })
    return
  }
  t.fail()
})
