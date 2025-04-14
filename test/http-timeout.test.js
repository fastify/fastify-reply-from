'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')
const FakeTimers = require('@sinonjs/fake-timers')

test('http request timeout', async (t) => {
  const clock = FakeTimers.createClock()
  const target = Fastify()
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

  instance.register(From, { http: { requestOptions: { timeout: 100 } } })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen({ port: 0 })

  const result = await request(`http://localhost:${instance.server.address().port}/`, {
    dispatcher: new Agent({
      pipelining: 0
    })
  })

  t.equal(result.statusCode, 504)
  t.match(result.headers['content-type'], /application\/json/)
  t.same(await result.body.json(), {
    statusCode: 504,
    code: 'FST_REPLY_FROM_GATEWAY_TIMEOUT',
    error: 'Gateway Timeout',
    message: 'Gateway Timeout'
  })
  clock.tick(200)
})

test('http request with specific timeout', async (t) => {
  const clock = FakeTimers.createClock()
  const target = Fastify()
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

  instance.register(From, { http: { requestOptions: { timeout: 100 } } })

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
  const result = await request(`http://localhost:${instance.server.address().port}/success`, {
    dispatcher: new Agent({
      pipelining: 0
    })
  })
  t.equal(result.statusCode, 200)

  const result2 = await request(`http://localhost:${instance.server.address().port}/fail`, {
    dispatcher: new Agent({
      pipelining: 0
    })
  })

  t.equal(result2.statusCode, 504)
  t.match(result2.headers['content-type'], /application\/json/)
  t.same(await result2.body.json(), {
    statusCode: 504,
    code: 'FST_REPLY_FROM_GATEWAY_TIMEOUT',
    error: 'Gateway Timeout',
    message: 'Gateway Timeout'
  })
})

test('http sse removes timeout test', async (t) => {
  const target = Fastify()
  t.teardown(target.close.bind(target))

  target.get('/', (_request, reply) => {
    t.pass('request arrives')

    reply.header('content-type', 'text/event-stream').status(200).send('hello world')
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  instance.register(From, { http: { requestOptions: { timeout: 100 } } })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen({ port: 0 })

  const { statusCode } = await request(`http://localhost:${instance.server.address().port}/`, {
    dispatcher: new Agent({
      pipelining: 0
    })
  })
  t.equal(statusCode, 200)
})
