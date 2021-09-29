'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const got = require('got')

let requestCount = 0

function createTargetServer (withRetryAfterHeader) {
  return http.createServer((req, res) => {
    console.log('request', requestCount)
    if (requestCount++ === 0) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'text/plain')
      if (withRetryAfterHeader) {
        res.setHeader('Retry-After', 1000)
      }
      return res.end('This Service Unavailable')
    }
    res.statusCode = 205
    res.setHeader('Content-Type', 'text/plain')
    return res.end('Hello World Twice!')
  })
}

test('Should retry on 503 HTTP error', async function (t) {
  t.teardown(() => { requestCount = 0 })
  t.plan(4)
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

  const res = await got.get(`http://localhost:${instance.server.address().port}`)
  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World Twice!')
  t.pass()
})

test('Should retry on 503 HTTP error with Retry-After response header', async function (t) {
  t.teardown(() => { requestCount = 0 })
  t.plan(4)
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

  const res = await got.get(`http://localhost:${instance.server.address().port}`)
  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World Twice!')
  t.pass()
})
