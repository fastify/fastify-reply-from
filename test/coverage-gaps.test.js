'use strict'

const { test } = require('node:test')
const http = require('node:http')
const Fastify = require('fastify')
const From = require('..')

test('base option as single-element array is normalized to string', async (t) => {
  t.plan(2)

  const target = http.createServer((req, res) => {
    res.statusCode = 200
    res.end('ok')
  })
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))
  t.after(() => target.close())

  const instance = Fastify()
  t.after(() => instance.close())
  instance.register(From, {
    base: [`http://localhost:${target.address().port}`]
  })

  instance.get('/', (_request, reply) => {
    reply.from('/')
  })

  await instance.listen({ port: 0 })

  const res = await instance.inject('/')
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
})

test('http agent close/destroy when not using undici or globalAgent', async (t) => {
  t.plan(2)

  const target = http.createServer((req, res) => {
    res.statusCode = 200
    res.end('ok')
  })
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))
  t.after(() => target.close())

  const instance = Fastify()
  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    undici: false
  })

  instance.get('/', (_request, reply) => {
    reply.from('/')
  })

  await instance.listen({ port: 0 })

  const res = await instance.inject('/')
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')

  await instance.close()
})

test('unsupported body type in http mode throws error', async (t) => {
  t.plan(1)

  const target = http.createServer((req, res) => {
    res.statusCode = 200
    res.end('ok')
  })
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))
  t.after(() => target.close())

  const instance = Fastify()
  t.after(() => instance.close())
  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    undici: false
  })

  instance.get('/', (_request, reply) => {
    reply.from('/', {
      body: 12345,
      contentType: 'application/octet-stream'
    })
  })

  await instance.listen({ port: 0 })

  const res = await instance.inject('/')
  t.assert.strictEqual(res.statusCode, 500)
})

test('strips connection headers in http1 mode', async (t) => {
  t.plan(3)

  const target = http.createServer((req, res) => {
    t.assert.strictEqual(req.headers['x-strip-me'], undefined, 'header should be stripped')
    res.statusCode = 200
    res.end('ok')
  })
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))
  t.after(() => target.close())

  const instance = Fastify()
  t.after(() => instance.close())
  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    undici: false,
    rewriteRequestHeaders: (_req, headers) => {
      headers.connection = 'x-strip-me'
      headers['x-strip-me'] = 'should-be-removed'
      return headers
    }
  })

  instance.get('/', (_request, reply) => {
    reply.from('/')
  })

  await instance.listen({ port: 0 })

  const res = await instance.inject('/')
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.payload, 'ok')
})
