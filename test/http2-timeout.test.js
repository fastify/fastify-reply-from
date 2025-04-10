'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const got = require('got')
const FakeTimers = require('@sinonjs/fake-timers')

test('http2 request timeout', async (t) => {
  const target = Fastify({ http2: true, sessionTimeout: 0 })
  t.teardown(target.close.bind(target))

  target.get('/', () => {
    t.pass('request arrives')
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: { requestTimeout: 100, sessionTimeout: 6000 }
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen({ port: 0 })

  try {
    await got.get(`http://localhost:${instance.server.address().port}/`, {
      retry: 0
    })
  } catch (err) {
    t.equal(err.response.statusCode, 504)
    t.match(err.response.headers['content-type'], /application\/json/)
    t.same(JSON.parse(err.response.body), {
      statusCode: 504,
      code: 'FST_REPLY_FROM_GATEWAY_TIMEOUT',
      error: 'Gateway Timeout',
      message: 'Gateway Timeout'
    })

    return
  }

  t.fail()
})

test('http2 request with specific timeout', async (t) => {
  const clock = FakeTimers.createClock()
  const target = Fastify({ http2: true })
  t.teardown(target.close.bind(target))

  target.get('/', (_request, reply) => {
    t.pass('request arrives')

    setTimeout(() => {
      reply.status(200).send('hello world')
    }, 200)

    clock.tick(200)
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: { requestTimeout: 100, sessionTimeout: 6000 }
  })

  instance.get('/success', (_request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`, {
      timeout: 300
    })
  })
  instance.get('/fail', (_request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`, {
      timeout: 50
    })
  })

  await instance.listen({ port: 0 })
  const { statusCode } = await got.get(`http://localhost:${instance.server.address().port}/success`, { retry: 0 })
  t.equal(statusCode, 200)

  try {
    await got.get(`http://localhost:${instance.server.address().port}/fail`, { retry: 0 })
  } catch (err) {
    t.equal(err.response.statusCode, 504)
    t.match(err.response.headers['content-type'], /application\/json/)
    t.same(JSON.parse(err.response.body), {
      statusCode: 504,
      code: 'FST_REPLY_FROM_GATEWAY_TIMEOUT',
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

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: { sessionTimeout: 100 }
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen({ port: 0 })

  try {
    await got.get(`http://localhost:${instance.server.address().port}/`, {
      retry: 0
    })
  } catch (err) {
    t.equal(err.response.statusCode, 504)
    t.match(err.response.headers['content-type'], /application\/json/)
    t.same(JSON.parse(err.response.body), {
      statusCode: 504,
      code: 'FST_REPLY_FROM_GATEWAY_TIMEOUT',
      error: 'Gateway Timeout',
      message: 'Gateway Timeout'
    })

    return
  }

  t.fail()
})

test('http2 sse removes request and session timeout test', async (t) => {
  const target = Fastify({ http2: true, sessionTimeout: 0 })

  target.get('/', (_request, reply) => {
    t.pass('request arrives')

    reply.status(200).header('content-type', 'text/event-stream').send('hello world')
  })

  await target.listen({ port: 0 })

  const instance = Fastify()

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: { sessionTimeout: 100 }
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen({ port: 0 })

  t.teardown(instance.close.bind(instance))
  t.teardown(target.close.bind(target))

  const { statusCode } = await got.get(`http://localhost:${instance.server.address().port}/`, { retry: 0 })
  t.equal(statusCode, 200)
  instance.close()
  target.close()
})
