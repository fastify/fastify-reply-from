'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')
const querystring = require('node:querystring')

const instance = Fastify()

instance.addHook('preHandler', (request, _reply, done) => {
  request.addedVal = 'test'
  done()
})

t.test('full querystring rewrite option function request', async (t) => {
  t.plan(7)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    t.assert.strictEqual(req.url, '/world?q=test')
    res.statusCode = 205
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('x-my-header', 'hello!')
    res.end('hello world')
  })

  instance.get('/hello', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}/world?a=b`, {
      queryString (_search, _reqUrl, request) {
        return querystring.stringify({ q: request.addedVal })
      }
    })
  })

  t.after(() => target.close())

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  instance.register(From)

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}/hello?a=b`)
  t.assert.strictEqual(result.headers['content-type'], 'text/plain')
  t.assert.strictEqual(result.headers['x-my-header'], 'hello!')
  t.assert.strictEqual(result.statusCode, 205)
  t.assert.strictEqual(await result.body.text(), 'hello world')
})
