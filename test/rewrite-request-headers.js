'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get').concat

const instance = Fastify()
instance.register(From)

t.plan(9)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  res.statusCode = 205
  res.setHeader('Content-Type', 'text/plain')
  res.end(req.headers.host)
})

instance.get('/', (request, reply) => {
  reply.from(`http://localhost:${target.address().port}`, {
    rewriteRequestHeaders: (originalReq, headers) => {
      t.pass('rewriteRequestHeaders called')
      return Object.assign(headers, { host: 'host-override' })
    }
  })
})

t.teardown(target.close.bind(target))

instance.listen(0, (err) => {
  t.error(err)

  target.listen(0, (err) => {
    t.error(err)

    get(`http://localhost:${instance.server.address().port}`, (err, res, data) => {
      t.error(err)
      t.equal(res.headers['content-type'], 'text/plain')
      t.equal(res.statusCode, 205)
      t.equal(data.toString(), 'host-override')
    })
  })
})
