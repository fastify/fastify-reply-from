'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')

test('http2 request timeout disabled', async (t) => {
  const target = Fastify({ http2: true })
  t.after(() => target.close())

  target.get('/', () => {
    t.assert.ok('request arrives')
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.after(() => instance.close())

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: { requestTimeout: 0, sessionTimeout: 16000 }
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen({ port: 0 })

  const result = await Promise.race([
    request(`http://localhost:${instance.server.address().port}/`, {
      dispatcher: new Agent({
        pipelining: 0
      })
    }),
    new Promise(resolve => setTimeout(resolve, 11000, 'passed'))
  ])

  // if we wait 11000 ms without a timeout error, we assume disabling the timeout worked
  // 10000 ms is the default timeout
  t.assert.strictEqual(result, 'passed')
})

test('http2 session timeout disabled', async (t) => {
  const target = Fastify({ http2: true })

  target.get('/', () => {
    t.assert.ok('request arrives')
  })

  await target.listen({ port: 0 })

  const instance = Fastify()

  instance.register(From, {
    sessionTimeout: 3000,
    destroyAgent: true,
    base: `http://localhost:${target.server.address().port}`,
    http2: { requestTimeout: 0, sessionTimeout: 0 }
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen({ port: 0 })

  const abortController = new AbortController()

  const result = await Promise.race([
    request(`http://localhost:${instance.server.address().port}/`, {
      dispatcher: new Agent({
        pipelining: 0
      }),
      signal: abortController.signal
    }),
    new Promise(resolve => setTimeout(resolve, 4000, 'passed'))
  ])

  // clean up right after the timeout, otherwise test will hang
  abortController.abort()
  target.close()
  instance.close()

  // if we wait 4000 ms without a timeout error, we assume disabling the session timeout for reply-from worked
  // because we pass 3000 ms as session timeout to the Fastify options itself
  t.assert.strictEqual(result, 'passed')
})
