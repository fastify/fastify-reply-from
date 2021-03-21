'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get').concat

const instance = Fastify()
instance.register(From, {
  base: 'http://localhost',
  http: true,
  disableCache: true
})

t.plan(7)
t.tearDown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  res.end(req.headers.host)
})

instance.get('/test', (request, reply) => {
  reply.from('/test', {
    getUpstream: (req, base) => {
      t.pass('getUpstream called')
      return `${base}:${target.address().port}`
    }
  })
})

t.tearDown(target.close.bind(target))

instance.listen(0, (err) => {
  t.error(err)

  target.listen(0, (err) => {
    t.error(err)

    get(`http://localhost:${instance.server.address().port}/test`, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
    })
  })
})
