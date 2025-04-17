'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')
const FakeTimers = require('@sinonjs/fake-timers')

test('undici request timeout', async (t) => {
  const clock = FakeTimers.createClock()
  const target = Fastify()
  t.after(() => target.close())

  target.get('/', (_request, reply) => {
    t.assert.ok('request arrives')

    setTimeout(() => {
      reply.status(200).send('hello world')
    }, 1000)

    clock.tick(1000)
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.after(() => instance.close())

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

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    dispatcher: new Agent({
      pipelining: 0
    })
  })

  t.assert.strictEqual(result.statusCode, 504)
  t.assert.match(result.headers['content-type'], /application\/json/)
  t.assert.deepStrictEqual(await result.body.json(), {
    statusCode: 504,
    code: 'FST_REPLY_FROM_GATEWAY_TIMEOUT',
    error: 'Gateway Timeout',
    message: 'Gateway Timeout'
  })
  clock.tick(1000)
})

test('undici request with specific timeout', async (t) => {
  const clock = FakeTimers.createClock()
  const target = Fastify()
  t.after(() => target.close())

  target.get('/', (_request, reply) => {
    t.assert.ok('request arrives')

    setTimeout(() => {
      reply.status(200).send('hello world')
    }, 1000)

    clock.tick(1000)
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.after(() => instance.close())

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

  const result = await request(`http://localhost:${instance.server.address().port}/success`, {
    dispatcher: new Agent({
      pipelining: 0
    })
  })
  t.assert.strictEqual(result.statusCode, 200)

  const result2 = await request(`http://localhost:${instance.server.address().port}/fail`, {
    dispatcher: new Agent({
      pipelining: 0
    })
  })

  t.assert.strictEqual(result2.statusCode, 504)
  t.assert.match(result2.headers['content-type'], /application\/json/)
  t.assert.deepStrictEqual(await result2.body.json(), {
    statusCode: 504,
    code: 'FST_REPLY_FROM_GATEWAY_TIMEOUT',
    error: 'Gateway Timeout',
    message: 'Gateway Timeout'
  })
  clock.tick(1000)
})
