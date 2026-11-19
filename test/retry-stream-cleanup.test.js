'use strict'

const { test } = require('node:test')
const http = require('node:http')
const http2 = require('node:http2')
const { once } = require('node:events')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')

const LARGE_ERROR_BODY = 'x'.repeat(128 * 1024)

test('destroys unconsumed upstream stream before retrying 503 with undici pool limit', async (t) => {
  let attempts = 0
  const target = http.createServer((_req, res) => {
    attempts += 1
    if (attempts === 1) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('Retry-After', '10')
      res.end(LARGE_ERROR_BODY)
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('recovered')
  })

  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const instance = Fastify()
  instance.register(From, {
    base: `http://127.0.0.1:${target.address().port}`,
    undici: { connections: 1 }
  })
  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.after(async () => {
    instance.server.closeAllConnections()
    target.closeAllConnections()
    await instance.close()
    await new Promise((resolve) => target.close(resolve))
  })

  await instance.listen({ port: 0 })

  const res = await request(`http://127.0.0.1:${instance.server.address().port}/`, {
    signal: AbortSignal.timeout(2000)
  })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(await res.body.text(), 'recovered')
  t.assert.strictEqual(attempts, 2)
})

test('destroys unconsumed upstream stream before retrying 503 with http.Agent maxSockets=1', async (t) => {
  let attempts = 0
  const target = http.createServer((_req, res) => {
    attempts += 1
    if (attempts === 1) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('Retry-After', '10')
      res.end(LARGE_ERROR_BODY)
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('recovered')
  })

  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const instance = Fastify()
  instance.register(From, {
    base: `http://127.0.0.1:${target.address().port}`,
    http: { agentOptions: { keepAlive: true, maxSockets: 1 } }
  })
  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.after(async () => {
    instance.server.closeAllConnections()
    target.closeAllConnections()
    await instance.close()
    await new Promise((resolve) => target.close(resolve))
  })

  await instance.listen({ port: 0 })

  const res = await request(`http://127.0.0.1:${instance.server.address().port}/`, {
    signal: AbortSignal.timeout(2000)
  })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(await res.body.text(), 'recovered')
  t.assert.strictEqual(attempts, 2)
})

test('closes unconsumed upstream stream before retrying 503 over http2 with maxConcurrentStreams=1', async (t) => {
  let attempts = 0
  const sessions = new Set()
  const target = http2.createServer({
    settings: { maxConcurrentStreams: 1 }
  })
  target.on('session', (session) => {
    sessions.add(session)
    session.on('close', () => sessions.delete(session))
  })
  target.on('stream', (stream) => {
    attempts += 1
    stream.on('error', () => {})
    if (attempts === 1) {
      stream.respond({ ':status': 503, 'retry-after': '10' })
      stream.write(LARGE_ERROR_BODY)
      stream.end()
      return
    }
    stream.respond({ ':status': 200, 'content-type': 'text/plain' })
    stream.end('recovered')
  })

  target.listen({ port: 0 })
  await once(target, 'listening')

  const instance = Fastify()
  instance.register(From, {
    base: `http://127.0.0.1:${target.address().port}`,
    http2: true
  })
  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.after(async () => {
    instance.server.closeAllConnections()
    for (const session of sessions) session.destroy()
    await instance.close()
    await new Promise((resolve) => target.close(resolve))
  })

  await instance.listen({ port: 0 })

  const res = await request(`http://127.0.0.1:${instance.server.address().port}/`, {
    signal: AbortSignal.timeout(2000)
  })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(await res.body.text(), 'recovered')
  t.assert.strictEqual(attempts, 2)
})

test('destroys unconsumed upstream stream before retrying with custom retryDelay', async (t) => {
  let attempts = 0
  const target = http.createServer((_req, res) => {
    attempts += 1
    if (attempts === 1) {
      res.statusCode = 429
      res.setHeader('Content-Type', 'text/plain')
      res.end(LARGE_ERROR_BODY)
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('recovered')
  })

  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const instance = Fastify()
  instance.register(From, {
    base: `http://127.0.0.1:${target.address().port}`,
    undici: { connections: 1 }
  })
  instance.get('/', (_request, reply) => {
    reply.from('', {
      retryDelay: ({ res }) => (res && res.statusCode === 429 ? 10 : null)
    })
  })

  t.after(async () => {
    instance.server.closeAllConnections()
    target.closeAllConnections()
    await instance.close()
    await new Promise((resolve) => target.close(resolve))
  })

  await instance.listen({ port: 0 })

  const res = await request(`http://127.0.0.1:${instance.server.address().port}/`, {
    signal: AbortSignal.timeout(2000)
  })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(await res.body.text(), 'recovered')
  t.assert.strictEqual(attempts, 2)
})
