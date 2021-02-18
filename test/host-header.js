'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const nock = require('nock')
const got = require('got')

test('hostname', async (t) => {
  const instance = Fastify()
  t.tearDown(instance.close.bind(instance))

  nock('http://httpbin.org')
    .get('/ip')
    .reply(200, function (uri, requestBody) {
      t.is(this.req.headers.host, 'httpbin.org')
      return { origin: '127.0.0.1' }
    })

  instance.get('*', (request, reply) => {
    reply.from()
  })

  instance.register(From, {
    base: 'http://httpbin.org'
  })

  await instance.listen(0)

  const res = await got.get(`http://localhost:${instance.server.address().port}/ip`, {
    retry: 0
  })
  t.strictEqual(res.statusCode, 200)
  t.strictEqual(res.headers['content-type'], 'application/json')
  t.strictEqual(typeof JSON.parse(res.body).origin, 'string')
})

test('hostname and port', async (t) => {
  const instance = Fastify()
  t.tearDown(instance.close.bind(instance))

  nock('http://httpbin.org:8080')
    .get('/ip')
    .reply(200, function (uri, requestBody) {
      t.is(this.req.headers.host, 'httpbin.org:8080')
      return { origin: '127.0.0.1' }
    })

  instance.get('*', (request, reply) => {
    reply.from()
  })

  instance.register(From, {
    base: 'http://httpbin.org:8080'
  })

  await instance.listen(0)

  const res = await got.get(`http://localhost:${instance.server.address().port}/ip`, {
    retry: 0
  })
  t.strictEqual(res.statusCode, 200)
  t.strictEqual(res.headers['content-type'], 'application/json')
  t.strictEqual(typeof JSON.parse(res.body).origin, 'string')
})
