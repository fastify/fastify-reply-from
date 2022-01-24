'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get').concat

const instance = Fastify()
instance.register(From)

t.plan(8)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  res.statusCode = 200
  res.end('hello world')
})

instance.get('/', (request1, reply) => {
  reply.from(`http://localhost:${target.address().port}`, {
    onResponse: (request2, reply, res) => {
      t.equal(request1.raw, request2.raw)
      reply.send(res)
    }
  })
})

t.teardown(target.close.bind(target))

instance.listen(0, (err) => {
  t.error(err)

  target.listen(0, (err) => {
    t.error(err)

    get(
      `http://localhost:${instance.server.address().port}`,
      (err, res, data) => {
        t.error(err)
        t.equal(res.statusCode, 200)
        t.equal(data.toString(), 'hello world')
      }
    )
  })
})
