'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

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
