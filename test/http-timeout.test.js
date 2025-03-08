'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')
const FakeTimers = require('@sinonjs/fake-timers')

const clock = FakeTimers.createClock()

test('http request timeout', async (t) => {
  const target = Fastify()
  t.teardown(target.close.bind(target))

  target.get('/', (_request, reply) => {
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
