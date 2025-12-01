'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()

t.test('full querystring url', async (t) => {
  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    t.assert.strictEqual(req.url, '/hi?a=/ho/%2E%2E/hi')
    res.statusCode = 205
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('x-my-header', 'hi!')
    res.end('hi')
  })

  await target.listen({ port: 0 })
  t.after(() => target.close())

  await instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/hi', (_request, reply) => {
    reply.from()
  })

  instance.get('/foo', (_request, reply) => {
    reply.from('/hi')
  })

  await instance.listen({ port: 0 })
  t.after(() => instance.close())

  {
    const result = await request(`http://localhost:${instance.server.address().port}/hi?a=/ho/%2E%2E/hi`)
    t.assert.strictEqual(result.headers['content-type'], 'text/plain')
    t.assert.strictEqual(result.headers['x-my-header'], 'hi!')
    t.assert.strictEqual(result.statusCode, 205)
    t.assert.strictEqual(await result.body.text(), 'hi')
  }

  {
    const result = await request(`http://localhost:${instance.server.address().port}/foo?a=/ho/%2E%2E/hi`)
    t.assert.strictEqual(result.headers['content-type'], 'text/plain')
    t.assert.strictEqual(result.headers['x-my-header'], 'hi!')
    t.assert.strictEqual(result.statusCode, 205)
    t.assert.strictEqual(await result.body.text(), 'hi')
  }
})
