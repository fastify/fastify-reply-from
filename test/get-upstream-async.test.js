'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')
const { once } = require('node:events')

t.test('async getUpstream with undici', async (t) => {
  t.plan(4)
  const instance = Fastify()
  instance.register(From, {
    disableCache: true
  })
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    res.end(req.headers.host)
  })
  t.after(() => target.close())

  instance.get('/test', (_request, reply) => {
    reply.from('/test', {
      getUpstream: async () => {
        t.assert.ok('async getUpstream called')
        await new Promise(resolve => setImmediate(resolve))
        return `http://localhost:${target.address().port}`
      }
    })
  })

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))
  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}/test`)
  t.assert.strictEqual(result.statusCode, 200)
})

t.test('async getUpstream with http and base', async (t) => {
  t.plan(3)
  const instance = Fastify()
  instance.register(From, {
    base: 'http://localhost',
    http: true,
    disableCache: true
  })
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.strictEqual(req.method, 'GET')
    res.end('ok')
  })
  t.after(() => target.close())

  instance.get('/test', (_request, reply) => {
    reply.from('/test', {
      getUpstream: async (_req, base) => {
        t.assert.ok('async getUpstream called')
        return `${base}:${target.address().port}`
      }
    })
  })

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))
  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}/test`)
  t.assert.strictEqual(result.statusCode, 200)
})

t.test('async getUpstream with caching', async (t) => {
  t.plan(3)
  const instance = Fastify()
  instance.register(From, {
    cacheURLs: 10
  })
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    res.end('cached')
  })
  t.after(() => target.close())

  let callCount = 0
  instance.get('/test', (_request, reply) => {
    reply.from('/test', {
      getUpstream: async () => {
        callCount++
        return `http://localhost:${target.address().port}`
      }
    })
  })

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))
  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const res1 = await request(`http://localhost:${instance.server.address().port}/test`)
  t.assert.strictEqual(res1.statusCode, 200)

  const res2 = await request(`http://localhost:${instance.server.address().port}/test`)
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(callCount, 2)
})

t.test('async getUpstream rejection invokes onError', async (t) => {
  t.plan(2)
  const instance = Fastify()
  instance.register(From)
  t.after(() => instance.close())

  instance.get('/error', (_request, reply) => {
    reply.from('/error', {
      getUpstream: async () => {
        throw new Error('database connection failed')
      },
      onError: (reply, { error }) => {
        t.assert.strictEqual(error.message, 'database connection failed')
        reply.code(503).send({ error: 'Service Unavailable' })
      }
    })
  })

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}/error`)
  t.assert.strictEqual(result.statusCode, 503)
})

t.test('async getUpstream catch error thrown in handleDest', async (t) => {
  t.plan(2)
  const instance = Fastify()
  instance.register(From)
  t.after(() => instance.close())

  instance.get('/invalid-body', (_request, reply) => {
    reply.from('/invalid-body', {
      body: 'invalid-body-for-get',
      getUpstream: async () => {
        return 'http://localhost:9999'
      },
      onError: (reply, { error }) => {
        t.assert.match(error.message, /Rewriting the body when doing a GET/)
        reply.code(500).send({ error: error.message })
      }
    })
  })

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}/invalid-body`)
  t.assert.strictEqual(result.statusCode, 500)
})

t.test('does not forward to upstream when client disconnects while async getUpstream is pending', async (t) => {
  t.plan(1)

  let upstreamCalled = false
  const target = http.createServer((_req, res) => {
    upstreamCalled = true
    res.statusCode = 200
    res.end('hello world')
  })
  t.after(() => target.close())
  target.listen({ port: 0 })
  await once(target, 'listening')

  const instance = Fastify()
  t.after(() => instance.close())

  instance.register(From)
  instance.get('/', (_request, reply) => {
    reply.from('/', {
      getUpstream: async () => {
        await new Promise(resolve => setTimeout(resolve, 300))
        return `http://localhost:${target.address().port}`
      }
    })
  })

  instance.listen({ port: 0 })
  await once(instance.server, 'listening')

  await new Promise((resolve) => {
    const req = http.request({
      host: 'localhost',
      port: instance.server.address().port,
      path: '/'
    }, (res) => { res.resume() })
    req.on('error', () => {})
    req.end()
    setTimeout(() => req.destroy(), 50)
    setTimeout(resolve, 500)
  })

  t.assert.strictEqual(upstreamCalled, false, 'upstream must not be called when request is aborted')
})
