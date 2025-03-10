'use strict'

const { test } = require('tap')
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
  t.teardown(target.close.bind(target))

  const instance = Fastify()

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.teardown(instance.close.bind(instance))
  await instance.listen({ port: 0 })

  const res = await request(`http://localhost:${instance.server.address().port}`)
  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(await res.body.text(), 'Hello World 2!')
})

test('Should retry on 503 HTTP error with Retry-After response header', async function (t) {
  t.plan(3)
  const target = createTargetServer(true)
  await new Promise(resolve => target.listen({ port: 0 }, resolve))
  t.teardown(target.close.bind(target))

  const instance = Fastify()

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.teardown(instance.close.bind(instance))
  await instance.listen({ port: 0 })

  const res = await request(`http://localhost:${instance.server.address().port}`)
  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(await res.body.text(), 'Hello World 2!')
})

test('Should abort if server is always returning 503', async function (t) {
  t.plan(2)
  const target = createTargetServer(true, Number.MAX_SAFE_INTEGER)
  await new Promise(resolve => target.listen({ port: 0 }, resolve))
  t.teardown(target.close.bind(target))

  const instance = Fastify()

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/', (_request, reply) => {
    reply.from()
  })

  t.teardown(instance.close.bind(instance))
  await instance.listen({ port: 0 })

  await request(`http://localhost:${instance.server.address().port}`)
  await request(`http://localhost:${instance.server.address().port}`)
  await request(`http://localhost:${instance.server.address().port}`)
  await request(`http://localhost:${instance.server.address().port}`)
  const result = await request(`http://localhost:${instance.server.address().port}`)
  t.equal(result.statusCode, 503)
  t.equal(await result.body.text(), 'This Service is Unavailable')
})
