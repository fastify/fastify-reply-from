'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

function createTargetServer (withRetryAfterHeader, stopAfter = 1) {
  let requestCount = 0
  return http.createServer((_req, res) => {
    if (requestCount++ < stopAfter) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'text/plain')
      if (withRetryAfterHeader) {
        res.setHeader('Retry-After', 100)
      }
      return res.end('This Service is Unavailable')
    }
    res.statusCode = 205
    res.setHeader('Content-Type', 'text/plain')
    return res.end(`Hello World ${requestCount}!`)
  })
}

test('Should retry on 503 HTTP error', async function (t) {
  t.plan(3)
  const target = createTargetServer()
  await new Promise(resolve => target.listen({ port: 0 }, resolve))
  t.after(() => target.close())

  const instance = Fastify()

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.after(() => instance.close())
  await instance.listen({ port: 0 })

  const res = await request(`http://localhost:${instance.server.address().port}`)
  t.assert.strictEqual(res.headers['content-type'], 'text/plain')
  t.assert.strictEqual(res.statusCode, 205)
  t.assert.strictEqual(await res.body.text(), 'Hello World 2!')
})

test('Should retry on 503 HTTP error with Retry-After response header', async function (t) {
  t.plan(3)
  const target = createTargetServer(true)
  await new Promise(resolve => target.listen({ port: 0 }, resolve))
  t.after(() => target.close())

  const instance = Fastify()

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.after(() => instance.close())
  await instance.listen({ port: 0 })

  const res = await request(`http://localhost:${instance.server.address().port}`)
  t.assert.strictEqual(res.headers['content-type'], 'text/plain')
  t.assert.strictEqual(res.statusCode, 205)
  t.assert.strictEqual(await res.body.text(), 'Hello World 2!')
})

test('Should abort if server is always returning 503', async function (t) {
  t.plan(2)
  const target = createTargetServer(true, Number.MAX_SAFE_INTEGER)
  await new Promise(resolve => target.listen({ port: 0 }, resolve))
  t.after(() => target.close())

  const instance = Fastify()

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.after(() => instance.close())
  await instance.listen({ port: 0 })

  await request(`http://localhost:${instance.server.address().port}`)
  await request(`http://localhost:${instance.server.address().port}`)
  await request(`http://localhost:${instance.server.address().port}`)
  await request(`http://localhost:${instance.server.address().port}`)
  const result = await request(`http://localhost:${instance.server.address().port}`)
  t.assert.strictEqual(result.statusCode, 503)
  t.assert.strictEqual(await result.body.text(), 'This Service is Unavailable')
})
