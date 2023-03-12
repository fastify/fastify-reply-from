'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const got = require('got')
const FakeTimers = require('@sinonjs/fake-timers')

const clock = FakeTimers.createClock()

test('http request timeout', async (t) => {
  t.autoend(false)

  const target = Fastify()
  t.teardown(target.close.bind(target))

  target.get('/', (request, reply) => {
    t.pass('request arrives')

    clock.setTimeout(() => {
      reply.status(200).send('hello world')
      t.end()
    }, 200)
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  instance.register(From, { http: { requestOptions: { timeout: 100 } } })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
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
    clock.tick(200)
    return
  }

  t.fail()
})

test('http sse removes timeout test', async (t) => {
  const target = Fastify()
  t.teardown(target.close.bind(target))

  target.get('/', (request, reply) => {
    t.pass('request arrives')

    reply.header('content-type', 'text/event-stream').status(200).send('hello world')
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  instance.register(From, { http: { requestOptions: { timeout: 100 } } })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen({ port: 0 })

  const { statusCode } = await got.get(`http://localhost:${instance.server.address().port}/`, { retry: 0 })
  t.equal(statusCode, 200)
})
