'use strict'

const Fastify = require('fastify')
const From = require('..')
const got = require('got')
const { test } = require('tap')

let retryNum = 1

const target = require('http').createServer(function (req, res) {
  if (retryNum % 2 !== 0) {
    req.socket.destroy()
  } else {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello world')
  }

  retryNum += 1
})

test('Will retry', async function (t) {
  t.teardown(() => { retryNum = 1 })

  await target.listen(0)
  t.teardown(target.close.bind(target))

  const instance = Fastify()

  instance.register(From, { http: true })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.address().port}/`, {
      retriesCount: 1,
      onError: (reply, { error }) => {
        t.equal(error.code, 'ECONNRESET')
        reply.send(error)
      }
    })
  })

  await instance.listen(0)
  t.teardown(instance.close.bind(instance))

  const { statusCode } = await got.get(`http://localhost:${instance.server.address().port}/`, { retry: 0 })
  t.equal(statusCode, 200)
})

test('will not retry', async function (t) {
  t.teardown(() => { retryNum = 1 })

  await target.listen(0)
  t.teardown(target.close.bind(target))

  const instance = Fastify()

  instance.register(From, { http: true })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.address().port}/`, {
      retriesCount: 0,
      onError: (reply, { error }) => {
        t.equal(error.code, 'ECONNRESET')
        reply.send(error)
      }
    })
  })

  await instance.listen(0)
  t.teardown(instance.close.bind(instance))

  try {
    await got.get(`http://localhost:${instance.server.address().port}/`, { retry: 0 })
    t.fail()
  } catch (err) {
    t.equal(err.response.statusCode, 500)
  }
})

test('will not retry unsupported method', async function (t) {
  t.teardown(() => { retryNum = 1 })

  await target.listen(0)
  t.teardown(target.close.bind(target))

  const instance = Fastify()

  instance.register(From, { http: true, retryMethods: ['DELETE'] })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.address().port}/`, {
      retriesCount: 1,
      onError: (reply, { error }) => {
        t.equal(error.code, 'ECONNRESET')
        reply.send(error)
      }
    })
  })

  await instance.listen(0)
  t.teardown(instance.close.bind(instance))

  try {
    await got.get(`http://localhost:${instance.server.address().port}/`, { retry: 0 })
    t.fail()
  } catch (err) {
    t.equal(err.response.statusCode, 500)
  }
})
