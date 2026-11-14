'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')

// undici runs headersTimeout on its fast timers, which tick about every 500ms:
// a 50-100ms timeout fires up to ~1s after it is set, and a 3000ms one no
// earlier than ~2.5s. Keep the upstream delay clear of both.
const UPSTREAM_DELAY = 1500

test('undici request timeout', async (t) => {
  const target = Fastify()
  t.after(() => target.close())

  target.get('/', (_request, reply) => {
    t.assert.ok('request arrives')

    setTimeout(() => {
      reply.status(200).send('hello world')
    }, UPSTREAM_DELAY)
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
})

test('undici request with specific timeout', async (t) => {
  const target = Fastify()
  t.after(() => target.close())

  target.get('/', (_request, reply) => {
    t.assert.ok('request arrives')

    setTimeout(() => {
      reply.status(200).send('hello world')
    }, UPSTREAM_DELAY)
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
      timeout: 3000
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
})
