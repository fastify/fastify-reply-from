'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.test('onResponse', async (t) => {
  t.plan(6)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    res.statusCode = 200
    res.end('hello world')
  })

  instance.get('/', (request1, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      onResponse: (request2, reply, res) => {
        t.assert.strictEqual(res.statusCode, 200)
        t.assert.strictEqual(request1.raw, request2.raw)
        reply.send(res.stream)
      }
    })
  })

  t.after(() => target.close())

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)
  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(await result.body.text(), 'hello world')
})

t.test('async onResponse', async (t) => {
  t.plan(3)
  const app = Fastify()
  app.register(From)
  t.after(() => app.close())

  const target = http.createServer((req, res) => {
    res.statusCode = 200
    res.end('hello async')
  })
  t.after(() => target.close())

  app.get('/', (_req, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      async onResponse (_request, reply, res) {
        const text = await new Response(res.stream).text()
        reply.removeHeader('content-length')
        reply.send(text.toUpperCase())
      }
    })
  })

  await app.listen({ port: 0 })
  await target.listen({ port: 0 })

  const result = await request(`http://localhost:${app.server.address().port}`)
  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(await result.body.text(), 'HELLO ASYNC')
  t.assert.strictEqual(result.headers['content-length'], '11')
})

t.test('async onResponse rejection invokes onError', async (t) => {
  t.plan(2)
  const app = Fastify()
  app.register(From)
  t.after(() => app.close())

  const target = http.createServer((req, res) => {
    res.statusCode = 200
    res.end('hello')
  })
  t.after(() => target.close())

  app.get('/', (_req, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      async onResponse () {
        throw new Error('async error in onResponse')
      },
      onError (reply, { error }) {
        t.assert.strictEqual(error.message, 'async error in onResponse')
        reply.code(500).send({ custom: 'handled' })
      }
    })
  })

  await app.listen({ port: 0 })
  await target.listen({ port: 0 })

  const result = await request(`http://localhost:${app.server.address().port}`)
  t.assert.strictEqual(result.statusCode, 500)
})

t.test('sync onResponse throw invokes onError', async (t) => {
  t.plan(2)
  const app = Fastify()
  app.register(From)
  t.after(() => app.close())

  const target = http.createServer((req, res) => {
    res.statusCode = 200
    res.end('hello')
  })
  t.after(() => target.close())

  app.get('/', (_req, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      onResponse () {
        throw new Error('sync error in onResponse')
      },
      onError (reply, { error }) {
        t.assert.strictEqual(error.message, 'sync error in onResponse')
        reply.code(500).send({ custom: 'handled' })
      }
    })
  })

  await app.listen({ port: 0 })
  await target.listen({ port: 0 })

  const result = await request(`http://localhost:${app.server.address().port}`)
  t.assert.strictEqual(result.statusCode, 500)
})

t.test('onResponse error when reply.sent is true does not double send', async (t) => {
  t.plan(2)
  const app = Fastify()
  app.register(From)
  t.after(() => app.close())

  const target = http.createServer((req, res) => {
    res.statusCode = 200
    res.end('hello')
  })
  t.after(() => target.close())

  let onErrorCalled = false
  app.get('/', (_req, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      onResponse (_request, reply, res) {
        reply.send('sent first')
        throw new Error('sync error after sent')
      },
      onError () {
        onErrorCalled = true
      }
    })
  })

  await app.listen({ port: 0 })
  await target.listen({ port: 0 })

  const result = await request(`http://localhost:${app.server.address().port}`)
  t.assert.strictEqual(await result.body.text(), 'sent first')
  t.assert.strictEqual(onErrorCalled, false)
})

t.test('onResponse returning reply does not throw or treat reply as promise', async (t) => {
  t.plan(2)
  const app = Fastify()
  app.register(From)
  t.after(() => app.close())

  const target = http.createServer((req, res) => {
    res.statusCode = 200
    res.end('hello concise')
  })
  t.after(() => target.close())

  app.get('/', (_req, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      onResponse: (_request, reply, res) => reply.send(res.stream)
    })
  })

  await app.listen({ port: 0 })
  await target.listen({ port: 0 })

  const result = await request(`http://localhost:${app.server.address().port}`)
  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(await result.body.text(), 'hello concise')
})
