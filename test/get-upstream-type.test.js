'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const get = require('simple-get').concat

const instance = Fastify()
instance.register(From, {
  disableCache: true
})

t.plan(8)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  res.end(req.headers.host)
})

instance.get('/', (request, reply) => {
  reply.from(`http://localhost:${target.address().port}`, {
    getUpstream: (req) => {
      t.pass('getUpstream called with correct request parameter')
      t.equal(req, request)
      return `http://localhost:${target.address().port}`
    }
  })
})

t.teardown(target.close.bind(target))

instance.listen({ port: 0 }, (err) => {
  t.error(err)

  target.listen({ port: 0 }, (err) => {
    t.error(err)

    get(`http://localhost:${instance.server.address().port}`, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
    })
  })
})
