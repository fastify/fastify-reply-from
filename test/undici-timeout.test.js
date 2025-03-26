'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const got = require('got')
const FakeTimers = require('@sinonjs/fake-timers')

test('undici request timeout', async (t) => {
  const clock = FakeTimers.createClock()
  const target = Fastify()
  t.teardown(target.close.bind(target))

  target.get('/', (_request, reply) => {
    t.pass('request arrives')

    setTimeout(() => {
      reply.status(200).send('hello world')
    }, 1000)

    clock.tick(1000)
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    undici: {
      headersTimeout: 100
    }
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  await instance.listen({ port: 0 })

  try {
    await got.get(`http://localhost:${instance.server.address().port}/`, { retry: 0 })
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

test('undici request with specific timeout', async (t) => {
  const clock = FakeTimers.createClock()
  const target = Fastify()
  t.teardown(target.close.bind(target))

  target.get('/', (_request, reply) => {
    t.pass('request arrives')

    setTimeout(() => {
      reply.status(200).send('hello world')
    }, 1000)

    clock.tick(1000)
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    undici: {
      headersTimeout: 100,
    }
  })

  instance.get('/success', (_request, reply) => {
    reply.from('/', {
      timeout: 1000
    })
  })
  instance.get('/fail', (_request, reply) => {
    reply.from('/', {
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
