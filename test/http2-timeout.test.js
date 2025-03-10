'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')

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

  const { statusCode } = await request(`http://localhost:${instance.server.address().port}/`, { retry: 0 })
  t.equal(statusCode, 200)
  instance.close()
  target.close()
})
