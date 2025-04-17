'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From, {
  disableCache: true
})

t.test('getUpstream undici', async (t) => {
  t.plan(4)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    res.end(req.headers.host)
  })

  instance.get('/test', (_request, reply) => {
    reply.from('/test', {
      getUpstream: () => {
        t.assert.ok('getUpstream called')
        return `http://localhost:${target.address().port}`
      }
    })
  })

  t.after(() => target.close())

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}/test`)

  t.assert.strictEqual(result.statusCode, 200)
})
