'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From, {
  disableCache: true
})

t.plan(6)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  res.end(req.headers.host)
})

instance.get('/test', (_request, reply) => {
  reply.from('/test', {
    getUpstream: () => {
      t.pass('getUpstream called')
      return `http://localhost:${target.address().port}`
    }
  })
})

t.teardown(target.close.bind(target))

instance.listen({ port: 0 }, (err) => {
  t.error(err)

  target.listen({ port: 0 }, async (err) => {
    t.error(err)

    const result = await request(`http://localhost:${instance.server.address().port}/test`)

    t.equal(result.statusCode, 200)
  })
})
