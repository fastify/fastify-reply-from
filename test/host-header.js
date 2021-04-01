'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const nock = require('nock')
const got = require('got')

test('hostname', async (t) => {
  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  nock('http://httpbin.org')
    .get('/ip')
    .reply(200, function (uri, requestBody) {
      t.equal(this.req.headers.host, 'httpbin.org')
      return { origin: '127.0.0.1' }
    })

  instance.get('*', (request, reply) => {
    reply.from()
  })

  instance.register(From, {
    base: 'http://httpbin.org',
    http: {} // force the use of Node.js core
  })

  await instance.listen(0)

  const res = await got.get(`http://localhost:${instance.server.address().port}/ip`, {
    retry: 0
  })
  t.equal(res.statusCode, 200)
  t.equal(res.headers['content-type'], 'application/json')
  t.equal(typeof JSON.parse(res.body).origin, 'string')
})

test('hostname and port', async (t) => {
  const instance = Fastify()
  t.teardown(instance.close.bind(instance))

  nock('http://httpbin.org:8080')
    .get('/ip')
    .reply(200, function (uri, requestBody) {
      t.equal(this.req.headers.host, 'httpbin.org:8080')
      return { origin: '127.0.0.1' }
    })

  instance.register(From, {
    base: 'http://httpbin.org:8080',
    http: true
  })

  instance.get('*', (request, reply) => {
    reply.from()
  })

  await instance.listen(0)

  const res = await got.get(`http://localhost:${instance.server.address().port}/ip`, {
    retry: 0
  })
  t.equal(res.statusCode, 200)
  t.equal(res.headers['content-type'], 'application/json')
  t.equal(typeof JSON.parse(res.body).origin, 'string')
})
