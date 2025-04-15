'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.test('rewriteRequestHeaders', async (t) => {
  t.plan(6)
  t.teardown(instance.close.bind(instance))

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'GET')
    res.statusCode = 205
    res.setHeader('Content-Type', 'text/plain')
    res.end(req.headers.host)
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      rewriteRequestHeaders: (_originalReq, headers) => {
        t.pass('rewriteRequestHeaders called')
        return Object.assign(headers, { host: 'host-override' })
      }
    })
  })

  t.teardown(target.close.bind(target))

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)

  t.equal(result.headers['content-type'], 'text/plain')
  t.equal(result.statusCode, 205)
  t.equal(await result.body.text(), 'host-override')
})
