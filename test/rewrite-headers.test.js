'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.test('rewriteHeaders', async (t) => {
  t.plan(7)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    res.statusCode = 205
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('x-my-header', 'hello!')
    res.end('hello world')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      rewriteHeaders: (headers) => {
        t.assert.ok('rewriteHeaders called')
        return {
          'content-type': headers['content-type'],
          'x-another-header': 'so headers!'
        }
      }
    })
  })

  t.after(() => target.close())

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))
  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)
  t.assert.strictEqual(result.headers['content-type'], 'text/plain')
  t.assert.strictEqual(result.headers['x-another-header'], 'so headers!')
  t.assert.ok(!result.headers['x-my-header'])
  t.assert.strictEqual(result.statusCode, 205)
})
