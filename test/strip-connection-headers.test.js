'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')

// RFC 7230 Section 6.1 - Connection header handling
// A proxy MUST parse the Connection header and remove any headers listed within it

// Helper to make HTTP request with Connection header (undici doesn't allow this)
function makeRequest (port, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'GET',
      hostname: 'localhost',
      port,
      path: '/',
      headers
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.end()
  })
}

t.test('strips headers listed in Connection header (undici)', async (t) => {
  t.plan(4)
  const instance = Fastify()
  instance.register(From)

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers['x-custom-header'], undefined, 'X-Custom-Header should be stripped')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    'X-Custom-Header': 'some-value',
    Connection: 'X-Custom-Header'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})

t.test('strips multiple headers listed in Connection header (undici)', async (t) => {
  t.plan(5)
  const instance = Fastify()
  instance.register(From)

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers['x-custom-one'], undefined, 'X-Custom-One should be stripped')
    t.assert.strictEqual(req.headers['x-custom-two'], undefined, 'X-Custom-Two should be stripped')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    'X-Custom-One': 'value1',
    'X-Custom-Two': 'value2',
    Connection: 'X-Custom-One, X-Custom-Two'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})

t.test('preserves headers not listed in Connection header (undici)', async (t) => {
  t.plan(5)
  const instance = Fastify()
  instance.register(From)

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers['x-keep-header'], 'keep-me', 'X-Keep-Header should be preserved')
    t.assert.strictEqual(req.headers['x-strip-header'], undefined, 'X-Strip-Header should be stripped')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    'X-Keep-Header': 'keep-me',
    'X-Strip-Header': 'strip-me',
    Connection: 'X-Strip-Header'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})

t.test('strips headers listed in Connection header (http)', async (t) => {
  t.plan(4)
  const instance = Fastify()
  instance.register(From, { undici: false })

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers['x-custom-header'], undefined, 'X-Custom-Header should be stripped')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    'X-Custom-Header': 'some-value',
    Connection: 'X-Custom-Header'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})

t.test('strips multiple headers listed in Connection header (http)', async (t) => {
  t.plan(5)
  const instance = Fastify()
  instance.register(From, { undici: false })

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers['x-custom-one'], undefined, 'X-Custom-One should be stripped')
    t.assert.strictEqual(req.headers['x-custom-two'], undefined, 'X-Custom-Two should be stripped')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    'X-Custom-One': 'value1',
    'X-Custom-Two': 'value2',
    Connection: 'X-Custom-One, X-Custom-Two'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})

t.test('handles Connection header with keep-alive and custom headers (undici)', async (t) => {
  t.plan(4)
  const instance = Fastify()
  instance.register(From)

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers['x-custom-header'], undefined, 'X-Custom-Header should be stripped')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    'X-Custom-Header': 'some-value',
    Connection: 'keep-alive, X-Custom-Header'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})
