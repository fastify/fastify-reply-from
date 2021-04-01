'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const got = require('got')

test('http2 request timeout', async (t) => {
  const target = Fastify({ http2: true, sessionTimeout: 0 })
  t.teardown(target.close.bind(target))

  target.get('/', () => {
    t.pass('request arrives')
  })

  await target.listen(0)

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: { requestTimeout: 100 }
  })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen(0)

  try {
    await got.get(`http://localhost:${instance.server.address().port}/`, {
      retry: 0
    })
  } catch (err) {
    t.equal(err.response.statusCode, 504)
    t.match(err.response.headers['content-type'], /application\/json/)
    t.same(JSON.parse(err.response.body), {
      statusCode: 504,
      error: 'Gateway Timeout',
      message: 'Gateway Timeout'
    })

    return
  }

  t.fail()
})

test('http2 session timeout', async (t) => {
  const target = Fastify({ http2: true, sessionTimeout: 0 })
  t.teardown(target.close.bind(target))

  target.get('/', () => {
    t.pass('request arrives')
  })

  await target.listen(0)

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: { sessionTimeout: 100 }
  })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen(0)

  try {
    await got.get(`http://localhost:${instance.server.address().port}/`, {
      retry: 0
    })
  } catch (err) {
    t.equal(err.response.statusCode, 504)
    t.match(err.response.headers['content-type'], /application\/json/)
    t.same(JSON.parse(err.response.body), {
      statusCode: 504,
      error: 'Gateway Timeout',
      message: 'Gateway Timeout'
    })

    return
  }

  t.fail()
})
