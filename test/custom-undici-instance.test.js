'use strict'

const t = require('node:test')
const assert = require('node:assert')
const Fastify = require('fastify')
const { Pool, request, Client } = require('undici')
const http = require('node:http')
const From = require('..')

const target = http.createServer((req, res) => {
  assert.ok('request proxied')
  assert.deepEqual(req.method, 'GET')
  assert.deepEqual(req.url, '/')
  assert.deepEqual(req.headers.connection, 'keep-alive')
  res.statusCode = 205
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('x-my-header', 'hello!')
  res.end('hello world')
})

t.test('use a custom instance of \'undici\'', async t => {
  t.after(() => target.close())

  await new Promise((resolve, reject) => target.listen({ port: 0 }, err => err ? reject(err) : resolve()))

  await t.test('custom Pool', async t => {
    const instance = Fastify()
    t.after(() => instance.close())
    instance.register(From, {
      base: `http://localhost:${target.address().port}`,
      undici: new Pool(`http://localhost:${target.address().port}`)
    })

    instance.get('/', (_request, reply) => {
      reply.from()
    })

    await new Promise(resolve => instance.listen({ port: 0 }, resolve))

    const result = await request(`http://localhost:${instance.server.address().port}`)

    t.assert.deepEqual(result.headers['content-type'], 'text/plain')
    t.assert.deepEqual(result.headers['x-my-header'], 'hello!')
    t.assert.deepEqual(result.statusCode, 205)
    t.assert.deepEqual(await result.body.text(), 'hello world')
  })

  await t.test('custom Client', async t => {
    const instance = Fastify()
    t.after(() => instance.close())
    instance.register(From, {
      base: `http://localhost:${target.address().port}`,
      undici: new Client(`http://localhost:${target.address().port}`)
    })

    instance.get('/', (_request, reply) => {
      reply.from()
    })

    await new Promise(resolve => instance.listen({ port: 0 }, resolve))

    const result = await request(`http://localhost:${instance.server.address().port}`)

    t.assert.deepEqual(result.headers['content-type'], 'text/plain')
    t.assert.deepEqual(result.headers['x-my-header'], 'hello!')
    t.assert.deepEqual(result.statusCode, 205)
    t.assert.deepEqual(await result.body.text(), 'hello world')
  })
})
