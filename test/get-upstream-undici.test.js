'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From, {
  disableCache: true
})

t.test('getUpstream undici', async (t) => {
  t.plan(4)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    res.end(req.headers.host)
  })

  instance.get('/test', (_request, reply) => {
    reply.from('/test', {
      getUpstream: () => {
        t.assert.ok('getUpstream called')
        return `http://localhost:${target.address().port}`
      }
    })
  })

  t.after(() => target.close())

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}/test`)

  t.assert.strictEqual(result.statusCode, 200)
})

t.test('async getUpstream undici', async (t) => {
  t.plan(6)

  const app = Fastify()
  app.register(From, {
    disableCache: true
  })
  t.after(() => app.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    res.end(req.headers.host)
  })
  t.after(() => target.close())

  app.get('/async-ok', (_request, reply) => {
    reply.from('/async-ok', {
      getUpstream: async () => {
        t.assert.ok('async getUpstream called')
        return `http://localhost:${target.address().port}`
      }
    })
  })

  app.get('/async-error', (_request, reply) => {
    reply.from('/async-error', {
      getUpstream: async () => {
        throw new Error('failed to resolve upstream')
      },
      onError: (reply, { error }) => {
        t.assert.strictEqual(error.message, 'failed to resolve upstream')
        reply.code(502).send({ error: error.message })
      }
    })
  })

  await new Promise(resolve => app.listen({ port: 0 }, resolve))
  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const okRes = await request(`http://localhost:${app.server.address().port}/async-ok`)
  t.assert.strictEqual(okRes.statusCode, 200)

  const errRes = await request(`http://localhost:${app.server.address().port}/async-error`)
  t.assert.strictEqual(errRes.statusCode, 502)
})
