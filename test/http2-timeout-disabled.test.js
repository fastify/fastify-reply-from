'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const got = require('got')

test('http2 request timeout disabled', async (t) => {
  const target = Fastify({ http2: true })
  t.teardown(target.close.bind(target))

  target.get('/', () => {
    t.pass('request arrives')
  })

  await target.listen({ port: 0 })

  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  instance.register(From, {
    base: `http://localhost:${target.server.address().port}`,
    http2: { requestTimeout: 0, sessionTimeout: 16000 }
  })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen({ port: 0 })

  const result = await Promise.race([
    got.get(`http://localhost:${instance.server.address().port}/`, {
      retry: 0
    }),
    new Promise(resolve => setTimeout(resolve, 11000, 'passed'))
  ])

  // if we wait 11000 ms without a timeout error, we assume disabling the timeout worked
  // 10000 ms is the default timeout
  t.equal(result, 'passed')
})

test('http2 session timeout disabled', async (t) => {
  const target = Fastify({ http2: true })

  target.get('/', () => {
    t.pass('request arrives')
  })

  await target.listen({ port: 0 })

  const instance = Fastify()

  instance.register(From, {
    sessionTimeout: 3000,
    destroyAgent: true,
    base: `http://localhost:${target.server.address().port}`,
    http2: { requestTimeout: 0, sessionTimeout: 0 }
  })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.server.address().port}/`)
  })

  await instance.listen({ port: 0 })

  const request = got.get(`http://localhost:${instance.server.address().port}/`, {
    retry: 0
  })

  const result = await Promise.race([
    request,
    new Promise(resolve => setTimeout(resolve, 4000, 'passed'))
  ])

  // clean up right after the timeout, otherwise test will hang
  request.cancel()
  target.close()
  instance.close()

  // if we wait 4000 ms without a timeout error, we assume disabling the session timeout for reply-from worked
  // because we pass 3000 ms as session timeout to the Fastify options itself
  t.equal(result, 'passed')
})
