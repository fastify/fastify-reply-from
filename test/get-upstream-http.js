'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get').concat

const instance = Fastify()
const instanceWithoutBase = Fastify()
instance.register(From, {
  base: 'http://localhost',
  http: true,
  disableCache: true
})

instanceWithoutBase.register(From, {
  http: true,
  disableCache: true
})

t.plan(13)
t.teardown(instance.close.bind(instance))
t.teardown(instanceWithoutBase.close.bind(instanceWithoutBase))

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

instanceWithoutBase.get('/test2', (request, reply) => {
  reply.from('/test2', {
    getUpstream: () => {
      t.pass('getUpstream called')
      return `http://localhost:${target.address().port}`
    }
  })
})

t.teardown(target.close.bind(target))

instance.listen(0, (err) => {
  t.error(err)
  instanceWithoutBase.listen(0, (err) => {
    t.error(err)
    target.listen(0, (err) => {
      t.error(err)

      get(`http://localhost:${instance.server.address().port}/test`, (err, res) => {
        t.error(err)
        t.equal(res.statusCode, 200)
      })

      get(`http://localhost:${instanceWithoutBase.server.address().port}/test2`, (err, res) => {
        t.error(err)
        t.equal(res.statusCode, 200)
      })
    })
  })
})
