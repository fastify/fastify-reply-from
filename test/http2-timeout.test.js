'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')
const FakeTimers = require('@sinonjs/fake-timers')

test('http2 request timeout', async (t) => {
  const target = Fastify({ http2: true, sessionTimeout: 0 })
  t.after(() => target.close())

  target.get('/', () => {
    t.assert.ok('request arrives')
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.after(() => instance.close())

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: { requestTimeout: 100, sessionTimeout: 6000 }
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen({ port: 0 })

  const result = await request(`http://localhost:${instance.server.address().port}/`, {
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
})

test('http2 request with specific timeout', async (t) => {
  const clock = FakeTimers.createClock()
  const target = Fastify({ http2: true })
  t.after(() => target.close())

  target.get('/', (_request, reply) => {
    t.assert.ok('request arrives')

    setTimeout(() => {
      reply.status(200).send('hello world')
    }, 200)

    clock.tick(200)
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.after(() => instance.close())

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
})

test('http2 session timeout', async (t) => {
  const target = Fastify({ http2: true, sessionTimeout: 0 })
  t.after(() => target.close())

  target.get('/', () => {
    t.assert.ok('request arrives')
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.after(() => instance.close())

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: { sessionTimeout: 100 }
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen({ port: 0 })

  const result = await request(`http://localhost:${instance.server.address().port}/`, {
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
})

test('http2 sse removes request and session timeout test', async (t) => {
  const target = Fastify({ http2: true, sessionTimeout: 0 })

  target.get('/', (_request, reply) => {
    t.assert.ok('request arrives')

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

  t.after(() => instance.close())
  t.after(() => target.close())

  const { statusCode } = await request(`http://localhost:${instance.server.address().port}/`, { dispatcher: new Agent({ pipelining: 0 }) })
  t.assert.strictEqual(statusCode, 200)
  instance.close()
  target.close()
})

test('http2 sse removes request and session timeout when content-type is uppercase and has parameters', async (t) => {
  // A media type is case-insensitive and may carry parameters (RFC 9110 §8.3.1),
  // so `Text/Event-Stream;charset=UTF-8` must be treated as SSE. The parsing is
  // covered deterministically in test/sse-content-type.test.js; this only
  // confirms it flows through the http2 path, the same shape as the sibling
  // above — no timers, no clock race.
  const target = Fastify({ http2: true, sessionTimeout: 0 })

  target.get('/', (_request, reply) => {
    t.assert.ok('request arrives')

    reply.hijack()
    reply.raw.writeHead(200, { 'content-type': 'Text/Event-Stream;charset=UTF-8' })
    reply.raw.end('data: hello\n\n')
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

  // instance must close before target: the SSE response disarms the plugin's
  // http2 session timeout, and before Node 24 an http2 server waits in close()
  // for open sessions — only instance.close() destroys that session.
  t.after(() => instance.close())
  t.after(() => target.close())

  const { statusCode, body } = await request(`http://localhost:${instance.server.address().port}/`, { dispatcher: new Agent({ pipelining: 0 }) })
  t.assert.strictEqual(statusCode, 200)
  t.assert.strictEqual(await body.text(), 'data: hello\n\n')
})
