'use strict'

const Fastify = require('fastify')
const { request, Agent } = require('undici')
const From = require('..')
const { test } = require('node:test')

let retryNum = 1

const target = require('node:http').createServer(function (req, res) {
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
  t.after(() => { retryNum = 1 })

  await target.listen({ port: 0 })
  t.after(() => target.close())

  const instance = Fastify()

  instance.register(From, { http: true })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}/`, {
      retriesCount: 1,
      onError: (reply, { error }) => {
        t.assert.deepEqual(error.code, 'ECONNRESET')
        reply.send(error)
      }
    })
  })

  await instance.listen({ port: 0 })
  t.after(() => instance.close())

  const { statusCode } = await request(`http://localhost:${instance.server.address().port}/`, { dispatcher: new Agent({ pipelining: 0 }) })
  t.assert.deepEqual(statusCode, 200)
})

test('will not retry', async function (t) {
  t.after(() => { retryNum = 1 })

  await target.listen({ port: 0 })
  t.after(() => target.close())

  const instance = Fastify()

  instance.register(From, { http: true })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}/`, {
      retriesCount: 0,
      onError: (reply, { error }) => {
        t.assert.deepEqual(error.code, 'ECONNRESET')
        reply.send(error)
      }
    })
  })

  await instance.listen({ port: 0 })
  t.after(() => instance.close())

  const result = await request(`http://localhost:${instance.server.address().port}/`, { dispatcher: new Agent({ pipelining: 0 }) })

  t.assert.deepEqual(result.statusCode, 500)
})

test('will not retry unsupported method', async function (t) {
  t.after(() => { retryNum = 1 })

  await new Promise(resolve => target.listen({ port: 0 }, resolve))
  t.after(() => target.close())

  const instance = Fastify()

  instance.register(From, { http: true, retryMethods: ['DELETE'] })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}/`, {
      retriesCount: 1,
      onError: (reply, { error }) => {
        t.assert.deepEqual(error.code, 'ECONNRESET')
        reply.send(error)
      }
    })
  })

  await instance.listen({ port: 0 })
  t.after(() => instance.close())

  const result = await request(`http://localhost:${instance.server.address().port}/`, { dispatcher: new Agent({ pipelining: 0 }) })
  t.assert.deepEqual(result.statusCode, 500)
})
