'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const { request } = require('undici')

const instance = Fastify()

t.test('async route handler', async (t) => {
  t.plan(8)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    t.assert.strictEqual(req.url, '/')
    res.statusCode = 205
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('x-my-header', 'hello!')
    res.end('hello world')
  })

  instance.get('/', async (_request, reply) => {
    const p = reply.from()
    t.assert.strictEqual(p, reply)
    return p
  })

  t.after(() => target.close())

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)

  t.assert.strictEqual(result.headers['content-type'], 'text/plain')
  t.assert.strictEqual(result.headers['x-my-header'], 'hello!')
  t.assert.strictEqual(result.statusCode, 205)
  t.assert.strictEqual(await result.body.text(), 'hello world')
})
