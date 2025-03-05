'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.plan(8)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  res.statusCode = 201
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

instance.listen({ port: 0 }, (err) => {
  t.error(err)

  target.listen({ port: 0 }, async (err) => {
    t.error(err)

    const result = await fetch(`http://localhost:${instance.server.address().port}`)

    t.equal(result.headers.get('content-type'), 'text/plain')
    t.equal(result.status, 201)
    t.equal(await result.text(), 'host-override')
  })
})
