'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const got = require('got')

function createTargetServer (withRetryAfterHeader, stopAfter = 1) {
  let requestCount = 0
  return http.createServer((req, res) => {
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
  await target.listen(0)
  t.teardown(target.close.bind(target))

  const instance = Fastify()

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/', (request, reply) => {
    reply.from()
  })

  t.teardown(instance.close.bind(instance))
  await instance.listen(0)

  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })
  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World 2!')
})

test('Should retry on 503 HTTP error with Retry-After response header', async function (t) {
  t.plan(3)
  const target = createTargetServer(true)
  await target.listen(0)
  t.teardown(target.close.bind(target))

  const instance = Fastify()

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/', (request, reply) => {
    reply.from()
  })

  t.teardown(instance.close.bind(instance))
  await instance.listen(0)

  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })
  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World 2!')
})

test('Should abort if server is always returning 503', async function (t) {
  t.plan(2)
  const target = createTargetServer(true, Number.MAX_SAFE_INTEGER)
  await target.listen(0)
  t.teardown(target.close.bind(target))

  const instance = Fastify()

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/', (request, reply) => {
    reply.from()
  })

  t.teardown(instance.close.bind(instance))
  await instance.listen(0)
  try {
    await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })
    t.fail()
  } catch (err) {
    t.equal(err.response.statusCode, 503)
    t.equal(err.response.body.toString(), 'This Service is Unavailable')
  }
})
